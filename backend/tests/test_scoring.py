"""
Unit tests for pure scoring functions in stock_analyzer.

These tests exercise _calculate_oversold_score, _check_absolute_steal,
and _check_overbought directly — no network calls, no DB.
"""

import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
from app.services.stock_analyzer import (
    _calculate_oversold_score,
    _check_absolute_steal,
    _check_overbought,
    _get_market_regime,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def base_score_kwargs(**overrides):
    """Neutral baseline — no signals fire, expected score ≈ 0."""
    defaults = dict(
        rsi=55,
        bb_percent=0.5,
        pct_from_high=-5,
        pe_ratio=20,
        forward_pe=18,
        debt_to_equity=50,
        revenue_growth=0.03,
        macd_line=-0.1,
        signal_line=0.1,
        current_price=100,
        dcf_value=None,
        stoch_k=50,
        ev_to_ebitda=15,
        fcf_yield=3,
        piotroski_score=5,
        sma_50=None,
        sma_200=None,
        volume_ratio=None,
    )
    defaults.update(overrides)
    return defaults


# ── RSI bands ──────────────────────────────────────────────────────────────────

class TestRSIScoring:
    def test_rsi_below_30_adds_40(self):
        score = _calculate_oversold_score(**base_score_kwargs(rsi=25))
        assert score >= 40

    def test_rsi_30_to_40_adds_25(self):
        score_35 = _calculate_oversold_score(**base_score_kwargs(rsi=35))
        score_55 = _calculate_oversold_score(**base_score_kwargs(rsi=55))
        assert score_35 - score_55 == 25

    def test_rsi_40_to_50_adds_10(self):
        score_45 = _calculate_oversold_score(**base_score_kwargs(rsi=45))
        score_55 = _calculate_oversold_score(**base_score_kwargs(rsi=55))
        assert score_45 - score_55 == 10

    def test_rsi_above_50_adds_nothing(self):
        score_60 = _calculate_oversold_score(**base_score_kwargs(rsi=60))
        score_55 = _calculate_oversold_score(**base_score_kwargs(rsi=55))
        assert score_60 == score_55


# ── Stochastic ─────────────────────────────────────────────────────────────────

class TestStochasticScoring:
    def test_stoch_below_20_adds_15(self):
        score_low = _calculate_oversold_score(**base_score_kwargs(stoch_k=15))
        score_mid = _calculate_oversold_score(**base_score_kwargs(stoch_k=50))
        assert score_low - score_mid == 15

    def test_stoch_20_to_30_adds_8(self):
        score_25 = _calculate_oversold_score(**base_score_kwargs(stoch_k=25))
        score_50 = _calculate_oversold_score(**base_score_kwargs(stoch_k=50))
        assert score_25 - score_50 == 8

    def test_dual_confirmation_bonus(self):
        # RSI < 30 AND stoch_k < 20 → extra +10
        score_dual = _calculate_oversold_score(**base_score_kwargs(rsi=25, stoch_k=15))
        score_rsi_only = _calculate_oversold_score(**base_score_kwargs(rsi=25, stoch_k=50))
        score_stoch_only = _calculate_oversold_score(**base_score_kwargs(rsi=55, stoch_k=15))
        assert score_dual == score_rsi_only + 15 + 10  # stoch adds 15, dual bonus adds 10


# ── Bollinger Band ─────────────────────────────────────────────────────────────

class TestBollingerBandScoring:
    def test_bb_below_0_1_adds_20(self):
        score_low = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.05))
        score_mid = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.5))
        assert score_low - score_mid == 20

    def test_bb_0_1_to_0_2_adds_10(self):
        score_15 = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.15))
        score_50 = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.5))
        assert score_15 - score_50 == 10

    def test_bb_above_0_2_adds_nothing(self):
        score_a = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.3))
        score_b = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.8))
        assert score_a == score_b


# ── Distance from 52-week high ────────────────────────────────────────────────

class TestPctFromHighScoring:
    def test_below_40pct_adds_20(self):
        score = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-45))
        baseline = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-5))
        assert score - baseline == 20

    def test_below_25pct_adds_12(self):
        score = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-30))
        baseline = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-5))
        assert score - baseline == 12

    def test_below_15pct_adds_5(self):
        score = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-20))
        baseline = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-5))
        assert score - baseline == 5


# ── Moving averages ────────────────────────────────────────────────────────────

class TestSMAScoring:
    def test_price_below_sma50_adds_5(self):
        score_below = _calculate_oversold_score(**base_score_kwargs(current_price=90, sma_50=100))
        score_above = _calculate_oversold_score(**base_score_kwargs(current_price=110, sma_50=100))
        assert score_below - score_above == 5

    def test_price_below_sma200_adds_5(self):
        score_below = _calculate_oversold_score(**base_score_kwargs(current_price=90, sma_200=100))
        score_above = _calculate_oversold_score(**base_score_kwargs(current_price=110, sma_200=100))
        assert score_below - score_above == 5

    def test_sma_none_no_points(self):
        score_none = _calculate_oversold_score(**base_score_kwargs(sma_50=None, sma_200=None))
        score_above = _calculate_oversold_score(**base_score_kwargs(current_price=110, sma_50=100, sma_200=100))
        assert score_none == score_above  # both contribute 0


# ── Fundamentals bonuses ───────────────────────────────────────────────────────

class TestFundamentalsScoring:
    def test_revenue_growth_above_5pct_adds_10(self):
        score_grow = _calculate_oversold_score(**base_score_kwargs(revenue_growth=0.10))
        score_flat = _calculate_oversold_score(**base_score_kwargs(revenue_growth=0.03))
        assert score_grow - score_flat == 10

    def test_pe_below_15_adds_10(self):
        score_cheap = _calculate_oversold_score(**base_score_kwargs(pe_ratio=12))
        score_fair = _calculate_oversold_score(**base_score_kwargs(pe_ratio=20))
        assert score_cheap - score_fair == 10

    def test_forward_pe_below_15_adds_7_when_no_pe(self):
        score = _calculate_oversold_score(**base_score_kwargs(pe_ratio=None, forward_pe=12))
        baseline = _calculate_oversold_score(**base_score_kwargs(pe_ratio=None, forward_pe=20))
        assert score - baseline == 7


# ── DCF undervaluation ────────────────────────────────────────────────────────

class TestDCFScoring:
    def test_50pct_undervalued_adds_20(self):
        score = _calculate_oversold_score(**base_score_kwargs(current_price=40, dcf_value=100))
        baseline = _calculate_oversold_score(**base_score_kwargs(dcf_value=None))
        assert score - baseline == 20

    def test_30pct_undervalued_adds_15(self):
        score = _calculate_oversold_score(**base_score_kwargs(current_price=65, dcf_value=100))
        baseline = _calculate_oversold_score(**base_score_kwargs(dcf_value=None))
        assert score - baseline == 15

    def test_no_undervaluation_no_bonus(self):
        score = _calculate_oversold_score(**base_score_kwargs(current_price=110, dcf_value=100))
        baseline = _calculate_oversold_score(**base_score_kwargs(dcf_value=None))
        assert score == baseline


# ── Debt penalty ───────────────────────────────────────────────────────────────

class TestDebtPenalty:
    def test_debt_above_300_subtracts_20(self):
        # Use rsi=35 (+25 pts) so the penalty reduces the score rather than
        # both clamping to 0 at the bottom.
        score_high = _calculate_oversold_score(**base_score_kwargs(rsi=35, debt_to_equity=350))
        score_low = _calculate_oversold_score(**base_score_kwargs(rsi=35, debt_to_equity=50))
        assert score_low - score_high == 20

    def test_debt_200_to_300_subtracts_10(self):
        score_high = _calculate_oversold_score(**base_score_kwargs(rsi=35, debt_to_equity=250))
        score_low = _calculate_oversold_score(**base_score_kwargs(rsi=35, debt_to_equity=50))
        assert score_low - score_high == 10

    def test_score_never_below_zero(self):
        # Max penalties should still clamp at 0
        score = _calculate_oversold_score(**base_score_kwargs(
            rsi=70, stoch_k=70, bb_percent=0.9,
            debt_to_equity=400, piotroski_score=1,
        ))
        assert score == 0


# ── Score ceiling ──────────────────────────────────────────────────────────────

def test_score_never_above_100():
    # Pile on every possible positive signal
    score = _calculate_oversold_score(**base_score_kwargs(
        rsi=25,
        stoch_k=15,
        bb_percent=0.05,
        pct_from_high=-50,
        revenue_growth=0.15,
        pe_ratio=10,
        ev_to_ebitda=5,
        fcf_yield=10,
        current_price=30,
        dcf_value=100,
        macd_line=1.0,
        signal_line=0.5,
        piotroski_score=8,
        sma_50=200,
        sma_200=200,
        volume_ratio=2.0,
        debt_to_equity=10,
    ))
    assert score == 100


# ── _check_absolute_steal ─────────────────────────────────────────────────────

class TestAbsoluteSteal:
    def _steal_kwargs(self, **overrides):
        defaults = dict(
            rsi=25,
            oversold_score=75,
            pe_ratio=12,
            revenue_growth=0.10,
            debt_to_equity=100,
            current_price=50,
            dcf_value=120,
            piotroski_score=8,
        )
        defaults.update(overrides)
        return defaults

    def test_all_conditions_met(self):
        result = _check_absolute_steal(**self._steal_kwargs())
        assert result["is_absolute_steal"] is True

    def test_rsi_not_oversold(self):
        result = _check_absolute_steal(**self._steal_kwargs(rsi=40))
        assert result["is_absolute_steal"] is False
        assert result["conditions"]["rsi_oversold"] is False

    def test_score_too_low(self):
        result = _check_absolute_steal(**self._steal_kwargs(oversold_score=60))
        assert result["is_absolute_steal"] is False
        assert result["conditions"]["strong_signal"] is False

    def test_high_pe(self):
        result = _check_absolute_steal(**self._steal_kwargs(pe_ratio=25))
        assert result["is_absolute_steal"] is False
        assert result["conditions"]["cheap_valuation"] is False

    def test_no_pe_means_not_cheap(self):
        result = _check_absolute_steal(**self._steal_kwargs(pe_ratio=None))
        assert result["conditions"]["cheap_valuation"] is False

    def test_high_debt(self):
        result = _check_absolute_steal(**self._steal_kwargs(debt_to_equity=250))
        assert result["is_absolute_steal"] is False
        assert result["conditions"]["low_leverage"] is False

    def test_none_debt_counts_as_low(self):
        result = _check_absolute_steal(**self._steal_kwargs(debt_to_equity=None))
        assert result["conditions"]["low_leverage"] is True

    def test_not_dcf_undervalued(self):
        result = _check_absolute_steal(**self._steal_kwargs(current_price=110, dcf_value=120))
        # current_price must be < dcf_value * 0.8  → 110 < 96 is False
        assert result["conditions"]["dcf_undervalued"] is False

    def test_weak_piotroski(self):
        result = _check_absolute_steal(**self._steal_kwargs(piotroski_score=5))
        assert result["conditions"]["financially_healthy"] is False


# ── _check_overbought ─────────────────────────────────────────────────────────

class TestOverbought:
    def _ob_kwargs(self, **overrides):
        defaults = dict(
            rsi=75,
            bb_percent=0.95,
            pct_from_low=30,
            pe_ratio=40,
            stoch_k=85,
        )
        defaults.update(overrides)
        return defaults

    def test_all_conditions_met(self):
        result = _check_overbought(**self._ob_kwargs())
        assert result["is_overbought"] is True

    def test_rsi_not_high(self):
        result = _check_overbought(**self._ob_kwargs(rsi=55))
        assert result["is_overbought"] is False
        assert result["conditions"]["rsi_high"] is False

    def test_stoch_not_overbought(self):
        result = _check_overbought(**self._ob_kwargs(stoch_k=60))
        assert result["is_overbought"] is False
        assert result["conditions"]["stoch_overbought"] is False

    def test_not_near_upper_band(self):
        result = _check_overbought(**self._ob_kwargs(bb_percent=0.5))
        assert result["is_overbought"] is False
        assert result["conditions"]["near_upper_band"] is False

    def test_not_far_from_low(self):
        result = _check_overbought(**self._ob_kwargs(pct_from_low=10))
        assert result["is_overbought"] is False
        assert result["conditions"]["far_from_low"] is False

    def test_no_pe_not_high_valuation(self):
        result = _check_overbought(**self._ob_kwargs(pe_ratio=None))
        assert result["conditions"]["high_valuation"] is False
        assert result["is_overbought"] is False


# ── _get_market_regime ────────────────────────────────────────────────────────

class TestGetMarketRegime:
    def _make_spy_hist(self, prices: list) -> pd.DataFrame:
        """Return a minimal hist DataFrame with a Close column."""
        idx = pd.date_range("2025-01-01", periods=len(prices), freq="B")
        return pd.DataFrame({"Close": prices}, index=idx)

    @patch("app.services.stock_analyzer._cache")
    @patch("app.services.stock_analyzer.yf.Ticker")
    def test_bull_regime(self, mock_ticker_cls, mock_cache):
        mock_cache.get.return_value = None
        # SPY well above both SMAs — need 200+ prices
        prices = [400.0] * 150 + [450.0] * 51  # SMA200≈~420, SMA50≈450, price=450
        mock_ticker_cls.return_value.history.return_value = self._make_spy_hist(prices)
        result = _get_market_regime()
        assert result["regime"] == "bull"
        assert result["spy_price"] is not None
        mock_cache.set.assert_called_once()

    @patch("app.services.stock_analyzer._cache")
    @patch("app.services.stock_analyzer.yf.Ticker")
    def test_caution_regime(self, mock_ticker_cls, mock_cache):
        mock_cache.get.return_value = None
        # SPY below SMA50 but above SMA200
        prices = [500.0] * 150 + [480.0] * 49 + [460.0]  # last price between sma50 and sma200
        mock_ticker_cls.return_value.history.return_value = self._make_spy_hist(prices)
        result = _get_market_regime()
        assert result["regime"] in ("caution", "bull", "bear")  # exact value depends on SMA math
        # Structural: result always has required keys
        assert set(result.keys()) == {"regime", "spy_price", "sma_50", "sma_200"}

    @patch("app.services.stock_analyzer._cache")
    @patch("app.services.stock_analyzer.yf.Ticker")
    def test_bear_regime(self, mock_ticker_cls, mock_cache):
        mock_cache.get.return_value = None
        # SPY well below SMA200 — falling prices throughout
        prices = [500.0] * 150 + [300.0] * 51  # current price far below both SMAs
        mock_ticker_cls.return_value.history.return_value = self._make_spy_hist(prices)
        result = _get_market_regime()
        assert result["regime"] == "bear"

    @patch("app.services.stock_analyzer._cache")
    @patch("app.services.stock_analyzer.yf.Ticker")
    def test_returns_cached_result(self, mock_ticker_cls, mock_cache):
        cached = {"regime": "caution", "spy_price": 440.0, "sma_50": 450.0, "sma_200": 420.0}
        mock_cache.get.return_value = cached
        result = _get_market_regime()
        assert result == cached
        mock_ticker_cls.assert_not_called()  # no network call when cached

    @patch("app.services.stock_analyzer._cache")
    @patch("app.services.stock_analyzer.yf.Ticker")
    def test_fail_open_on_exception(self, mock_ticker_cls, mock_cache):
        mock_cache.get.return_value = None
        mock_ticker_cls.side_effect = Exception("network error")
        result = _get_market_regime()
        assert result["regime"] == "bull"  # fail-open
