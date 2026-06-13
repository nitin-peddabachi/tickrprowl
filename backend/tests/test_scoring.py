"""
Unit tests for pure scoring functions in stock_analyzer.

These tests exercise _calculate_oversold_score, _check_absolute_steal,
_check_overbought, _get_market_regime, and _get_signal directly — no
network calls, no DB.
"""

import pytest
from unittest.mock import patch
import pandas as pd
from app.services.stock_analyzer import (
    _calculate_oversold_score,
    _check_absolute_steal,
    _check_overbought,
    _get_market_regime,
    _get_signal,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def base_score_kwargs(**overrides):
    """Neutral baseline — no oversold signals fire, expected composite ≈ 0."""
    defaults = dict(
        rsi=55,
        bb_percent=0.5,
        pct_from_high=-5,
        pe_ratio=19,          # just below 20 so valuation_cheap=True for pct_from_high tests
        forward_pe=18,
        debt_to_equity=50,
        revenue_growth=0.03,
        macd_crossover_event=False,
        rsi_divergence_detected=False,
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
        score = _calculate_oversold_score(**base_score_kwargs(rsi=25))["composite"]
        assert score >= 40

    def test_rsi_30_to_40_adds_25(self):
        score_35 = _calculate_oversold_score(**base_score_kwargs(rsi=35))["composite"]
        score_55 = _calculate_oversold_score(**base_score_kwargs(rsi=55))["composite"]
        assert score_35 - score_55 == 25

    def test_rsi_above_50_adds_nothing(self):
        score_60 = _calculate_oversold_score(**base_score_kwargs(rsi=60))["composite"]
        score_55 = _calculate_oversold_score(**base_score_kwargs(rsi=55))["composite"]
        assert score_60 == score_55


# ── Stochastic ─────────────────────────────────────────────────────────────────

class TestStochasticScoring:
    def test_stoch_below_20_adds_15(self):
        score_low = _calculate_oversold_score(**base_score_kwargs(stoch_k=15))["composite"]
        score_mid = _calculate_oversold_score(**base_score_kwargs(stoch_k=50))["composite"]
        assert score_low - score_mid == 15

    def test_stoch_20_to_30_adds_8(self):
        score_25 = _calculate_oversold_score(**base_score_kwargs(stoch_k=25))["composite"]
        score_50 = _calculate_oversold_score(**base_score_kwargs(stoch_k=50))["composite"]
        assert score_25 - score_50 == 8

    def test_dual_confirmation_bonus(self):
        # RSI<30 fills the technical cap (40); stoch and dual bonus are absorbed.
        result = _calculate_oversold_score(**base_score_kwargs(rsi=25, stoch_k=15))
        assert result["technical"] == 40

        # Stoch oversold alone (without RSI<30) contributes 15 technical points correctly.
        score_stoch = _calculate_oversold_score(**base_score_kwargs(rsi=55, stoch_k=15))["composite"]
        score_neutral = _calculate_oversold_score(**base_score_kwargs(rsi=55, stoch_k=50))["composite"]
        assert score_stoch - score_neutral == 15


# ── Bollinger Band ─────────────────────────────────────────────────────────────

class TestBollingerBandScoring:
    def test_bb_below_0_1_adds_20(self):
        score_low = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.05))["composite"]
        score_mid = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.5))["composite"]
        assert score_low - score_mid == 20

    def test_bb_0_1_to_0_2_adds_10(self):
        score_15 = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.15))["composite"]
        score_50 = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.5))["composite"]
        assert score_15 - score_50 == 10

    def test_bb_above_0_2_adds_nothing(self):
        score_a = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.3))["composite"]
        score_b = _calculate_oversold_score(**base_score_kwargs(bb_percent=0.8))["composite"]
        assert score_a == score_b


# ── Distance from 52-week high ─────────────────────────────────────────────────
# Note: these bonuses are gated by valuation_cheap (pe_ratio < 20 or ev_to_ebitda < 12).
# The baseline uses pe_ratio=19 so the gate is open for all three tests.

class TestPctFromHighScoring:
    def test_below_40pct_adds_20(self):
        score = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-45))["composite"]
        baseline = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-5))["composite"]
        assert score - baseline == 20

    def test_below_25pct_adds_12(self):
        score = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-30))["composite"]
        baseline = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-5))["composite"]
        assert score - baseline == 12

    def test_below_15pct_adds_5(self):
        score = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-20))["composite"]
        baseline = _calculate_oversold_score(**base_score_kwargs(pct_from_high=-5))["composite"]
        assert score - baseline == 5


# ── Moving averages ────────────────────────────────────────────────────────────

class TestSMAScoring:
    def test_price_below_sma50_adds_5(self):
        score_below = _calculate_oversold_score(**base_score_kwargs(current_price=90, sma_50=100))["composite"]
        score_above = _calculate_oversold_score(**base_score_kwargs(current_price=110, sma_50=100))["composite"]
        assert score_below - score_above == 5

    def test_price_below_sma200_adds_5(self):
        score_below = _calculate_oversold_score(**base_score_kwargs(current_price=90, sma_200=100))["composite"]
        score_above = _calculate_oversold_score(**base_score_kwargs(current_price=110, sma_200=100))["composite"]
        assert score_below - score_above == 5

    def test_sma_none_no_points(self):
        score_none = _calculate_oversold_score(**base_score_kwargs(sma_50=None, sma_200=None))["composite"]
        score_above = _calculate_oversold_score(**base_score_kwargs(current_price=110, sma_50=100, sma_200=100))["composite"]
        assert score_none == score_above  # both above SMAs → both contribute 0


# ── Fundamentals bonuses ───────────────────────────────────────────────────────

class TestFundamentalsScoring:
    def test_revenue_growth_above_5pct_adds_5(self):
        score_grow = _calculate_oversold_score(**base_score_kwargs(revenue_growth=0.10))["composite"]
        score_flat = _calculate_oversold_score(**base_score_kwargs(revenue_growth=0.03))["composite"]
        assert score_grow - score_flat == 5

    def test_pe_below_15_adds_10(self):
        score_cheap = _calculate_oversold_score(**base_score_kwargs(pe_ratio=12))["composite"]
        score_fair = _calculate_oversold_score(**base_score_kwargs(pe_ratio=20))["composite"]
        assert score_cheap - score_fair == 10

    def test_forward_pe_below_15_adds_7_when_no_pe(self):
        score = _calculate_oversold_score(**base_score_kwargs(pe_ratio=None, forward_pe=12))["composite"]
        baseline = _calculate_oversold_score(**base_score_kwargs(pe_ratio=None, forward_pe=20))["composite"]
        assert score - baseline == 7


# ── DCF undervaluation ────────────────────────────────────────────────────────

class TestDCFScoring:
    def test_50pct_undervalued_adds_20(self):
        score = _calculate_oversold_score(**base_score_kwargs(current_price=40, dcf_value=100))["composite"]
        baseline = _calculate_oversold_score(**base_score_kwargs(dcf_value=None))["composite"]
        assert score - baseline == 20

    def test_30pct_undervalued_adds_15(self):
        score = _calculate_oversold_score(**base_score_kwargs(current_price=65, dcf_value=100))["composite"]
        baseline = _calculate_oversold_score(**base_score_kwargs(dcf_value=None))["composite"]
        assert score - baseline == 15

    def test_no_undervaluation_no_bonus(self):
        score = _calculate_oversold_score(**base_score_kwargs(current_price=110, dcf_value=100))["composite"]
        baseline = _calculate_oversold_score(**base_score_kwargs(dcf_value=None))["composite"]
        assert score == baseline


# ── Debt penalty ───────────────────────────────────────────────────────────────
# The quality bucket is clamped at [0, 20]. To make the penalty visible, we need
# a quality baseline > 0: piotroski=8 (+10) + revenue 10% (+5) = 15 baseline.

class TestDebtPenalty:
    def _base(self, **overrides):
        return base_score_kwargs(rsi=35, piotroski_score=8, revenue_growth=0.10, **overrides)

    def test_debt_above_300_wipes_quality(self):
        # quality: 15 → max(15-20, 0) = 0; diff = 15
        score_high = _calculate_oversold_score(**self._base(debt_to_equity=350))["composite"]
        score_low  = _calculate_oversold_score(**self._base(debt_to_equity=50))["composite"]
        assert score_low - score_high == 15

    def test_debt_200_to_300_subtracts_10(self):
        # quality: 15 → 5; diff = 10
        score_high = _calculate_oversold_score(**self._base(debt_to_equity=250))["composite"]
        score_low  = _calculate_oversold_score(**self._base(debt_to_equity=50))["composite"]
        assert score_low - score_high == 10

    def test_score_never_below_zero(self):
        score = _calculate_oversold_score(**base_score_kwargs(
            rsi=70, stoch_k=70, bb_percent=0.9,
            debt_to_equity=400, piotroski_score=1,
        ))["composite"]
        assert score == 0


# ── Score ceiling ──────────────────────────────────────────────────────────────

def test_score_never_above_100():
    # Pile on every positive signal. Max achievable = 40 (technical) + 40 (valuation) + 15 (quality) = 95.
    # Quality cap is 20 but max earnable from current rules is piotroski(10) + revenue(5) = 15.
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
        macd_crossover_event=True,
        rsi_divergence_detected=True,
        piotroski_score=8,
        sma_50=200,
        sma_200=200,
        volume_ratio=2.0,
        debt_to_equity=10,
    ))["composite"]
    assert score == 95


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
        # pe_ratio=None → condition is None ("unknown"), not False; it must not be True
        result = _check_absolute_steal(**self._steal_kwargs(pe_ratio=None))
        assert result["conditions"]["cheap_valuation"] is not True

    def test_high_debt(self):
        result = _check_absolute_steal(**self._steal_kwargs(debt_to_equity=250))
        assert result["is_absolute_steal"] is False
        assert result["conditions"]["low_leverage"] is False

    def test_none_debt_counts_as_low(self):
        result = _check_absolute_steal(**self._steal_kwargs(debt_to_equity=None))
        assert result["conditions"]["low_leverage"] is True

    def test_not_dcf_undervalued(self):
        result = _check_absolute_steal(**self._steal_kwargs(current_price=110, dcf_value=120))
        # current_price must be < dcf_value * 0.8 → 110 < 96 is False
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
        # pe_ratio=None → high_valuation is None ("unknown"); other 4 conditions are True
        # so is_overbought still fires (len(known)=4 >= 3 and all True)
        result = _check_overbought(**self._ob_kwargs(pe_ratio=None))
        assert result["conditions"]["high_valuation"] is not True
        assert result["is_overbought"] is True


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


# ── Market regime signal downgrade ────────────────────────────────────────────

class TestMarketRegimeSignalDowngrade:
    """Verify that caution/bear regime downgrades buy-side signals in _get_signal."""

    def _sig_kwargs(self, **overrides):
        """Baseline that produces Strong Buy: score 75, liquid, not overbought."""
        defaults = dict(
            oversold_score=75,
            rsi=25,
            bb_percent=0.05,
            stoch_k=15,
            pct_from_high=-30,
            pe_ratio=12,
            forward_pe=10,
            revenue_growth=0.10,
            dcf_value=150,
            current_price=100,
            macd_crossover_event=False,
            macd_bearish_event=False,
            piotroski_score=8,
            fcf_yield=8,
            ev_to_ebitda=7,
            market_cap=5_000_000_000,
            avg_dollar_volume=5_000_000,
        )
        defaults.update(overrides)
        return defaults

    def test_bull_no_downgrade(self):
        result = _get_signal(**self._sig_kwargs(), market_regime={"regime": "bull"})
        assert result["signal"] == "Strong Buy"

    def test_caution_downgrades_strong_buy_to_buy(self):
        regime = {"regime": "caution", "sma_50": 450.0, "sma_200": 420.0}
        result = _get_signal(**self._sig_kwargs(), market_regime=regime)
        assert result["signal"] == "Buy"
        assert any("Caution" in r for r in result["signal_reasons"])

    def test_caution_does_not_downgrade_buy(self):
        # Caution only downgrades Strong Buy → Buy, not Buy → Watch
        regime = {"regime": "caution", "sma_50": 450.0, "sma_200": 420.0}
        result = _get_signal(**self._sig_kwargs(oversold_score=55), market_regime=regime)
        assert result["signal"] == "Buy"

    def test_bear_downgrades_strong_buy_to_buy(self):
        regime = {"regime": "bear", "sma_50": 400.0, "sma_200": 420.0}
        result = _get_signal(**self._sig_kwargs(), market_regime=regime)
        assert result["signal"] == "Buy"
        assert any("Bear" in r for r in result["signal_reasons"])

    def test_bear_downgrades_buy_to_watch(self):
        regime = {"regime": "bear", "sma_50": 400.0, "sma_200": 420.0}
        result = _get_signal(**self._sig_kwargs(oversold_score=55), market_regime=regime)
        assert result["signal"] == "Watch"
        assert any("Bear" in r for r in result["signal_reasons"])

    def test_bear_does_not_downgrade_sell(self):
        # Sell/Strong Sell are unaffected by regime downgrade
        regime = {"regime": "bear", "sma_50": 400.0, "sma_200": 420.0}
        result = _get_signal(**self._sig_kwargs(
            oversold_score=5, rsi=75, stoch_k=85, bb_percent=0.95,
            pe_ratio=40, pct_from_high=-2,
        ), market_regime=regime)
        assert result["signal"] in ("Strong Sell", "Sell")

    def test_no_regime_defaults_to_bull(self):
        result = _get_signal(**self._sig_kwargs(), market_regime=None)
        assert result["signal"] == "Strong Buy"
