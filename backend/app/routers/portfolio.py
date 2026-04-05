from __future__ import annotations

from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
import io
from app.models.database import get_db, PortfolioPosition
from app.services.stock_analyzer import get_stock_analysis

router = APIRouter()

# Symbols to skip entirely (unresolvable Fidelity placeholders)
SKIP_SYMBOLS = {"FCASH**", "FDRXX**", "SPAXX**", "FDRXX**"}

# Cash / money-market symbols — import with value but skip yfinance analysis
CASH_SYMBOLS = {"SPAXX", "FDRXX", "FCASH", "CORE**", "MMDA1", "MMDA4", "SWEEP"}


def _parse_money(val: str):
    """Strip broker formatting ($, +, %, commas, parens for negatives) and return float or None."""
    if not val or val.strip() in ("--", "", "N/A", "n/a"):
        return None
    cleaned = val.strip().replace("$", "").replace(",", "").replace("+", "").replace("%", "")
    # Handle parenthetical negatives like (123.45)
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    try:
        return float(cleaned)
    except ValueError:
        return None


def _detect_broker(headers: list[str]) -> str:
    """Detect broker from CSV column headers."""
    header_set = {h.strip() for h in headers}
    if "Market Value" in header_set or "Unit Cost" in header_set:
        return "etrade"
    if "Purchased Qty." in header_set or "Est. Market Value" in header_set:
        return "etrade_espp"
    return "fidelity"


def _parse_espp_row(row: dict) -> dict | None:
    """Parse one row from an E*Trade ESPP ByBenefitType CSV."""
    if row.get("Record Type", "").strip() != "Purchase":
        return None
    symbol = row.get("Symbol", "").strip()
    if not symbol:
        return None

    net_shares = _parse_money(row.get("Net Shares", "") or row.get("Purchased Qty.", ""))
    if net_shares is None or net_shares <= 0:
        return None

    current_value = _parse_money(row.get("Est. Market Value", ""))
    avg_cost = _parse_money(row.get("Est. Cost Basis (per share):", ""))
    cost_basis_total = round(net_shares * avg_cost, 2) if net_shares and avg_cost else None
    total_gl_dollar = _parse_money(row.get("Expected Gain/Loss", ""))
    total_gl_pct = None
    if cost_basis_total and cost_basis_total > 0 and total_gl_dollar is not None:
        total_gl_pct = round(total_gl_dollar / cost_basis_total * 100, 2)
    last_price = round(current_value / net_shares, 4) if current_value and net_shares else None
    purchase_date = row.get("Purchase Date", "").strip()

    return dict(
        broker="etrade_espp",
        account_number="ESPP",
        account_name=f"E*Trade ESPP ({purchase_date})" if purchase_date else "E*Trade ESPP",
        ticker=symbol.upper(),
        company_name="",
        shares=net_shares,
        avg_cost=avg_cost,
        cost_basis_total=cost_basis_total,
        last_price=last_price,
        current_value=current_value,
        total_gl_dollar=total_gl_dollar,
        total_gl_pct=total_gl_pct,
    )


def _parse_fidelity_row(row: dict) -> dict | None:
    """Parse one row from a Fidelity positions CSV."""
    symbol = row.get("Symbol", "").strip()
    if not symbol or symbol in SKIP_SYMBOLS or "Pending" in symbol:
        return None
    if not row.get("Account Number", "").strip():
        return None

    is_cash = symbol in CASH_SYMBOLS
    shares = _parse_money(row.get("Quantity", ""))
    current_value = _parse_money(row.get("Current Value", ""))

    if is_cash:
        if not current_value:
            return None
    else:
        if shares is None or shares <= 0:
            return None

    return dict(
        broker="fidelity",
        account_number=row.get("Account Number", "").strip(),
        account_name=row.get("Account Name", "").strip(),
        ticker=symbol.upper(),
        company_name=row.get("Description", "").strip() or ("Cash & Money Market" if is_cash else ""),
        shares=shares,
        avg_cost=_parse_money(row.get("Average Cost Basis", "")),
        cost_basis_total=_parse_money(row.get("Cost Basis Total", "")),
        last_price=_parse_money(row.get("Last Price", "")),
        current_value=current_value,
        total_gl_dollar=_parse_money(row.get("Total Gain/Loss Dollar", "")),
        total_gl_pct=_parse_money(row.get("Total Gain/Loss Percent", "")),
    )


def _parse_etrade_row(row: dict, account_label: str) -> dict | None:
    """Parse one row from an E*Trade positions CSV."""
    symbol = row.get("Symbol", "").strip()
    if not symbol or symbol in SKIP_SYMBOLS or "Pending" in symbol:
        return None

    is_cash = symbol in CASH_SYMBOLS
    shares = _parse_money(row.get("Quantity", ""))
    current_value = _parse_money(row.get("Market Value", ""))

    if is_cash:
        if not current_value:
            return None
    else:
        if shares is None or shares <= 0:
            return None

    avg_cost = _parse_money(row.get("Unit Cost", ""))
    total_gl_dollar = _parse_money(row.get("Total Gain ($)", "") or row.get("Total Gain", ""))
    total_gl_pct = _parse_money(row.get("Total Gain (%)", "") or row.get("Total Gain %", ""))

    # Derive cost basis total if not directly available
    cost_basis_total = None
    if current_value is not None and total_gl_dollar is not None:
        cost_basis_total = current_value - total_gl_dollar
    elif shares and avg_cost:
        cost_basis_total = shares * avg_cost

    return dict(
        broker="etrade",
        account_number=account_label,
        account_name=account_label or "E*Trade",
        ticker=symbol.upper(),
        company_name=row.get("Description", "").strip() or ("Cash & Money Market" if is_cash else ""),
        shares=shares,
        avg_cost=avg_cost,
        cost_basis_total=cost_basis_total,
        last_price=_parse_money(row.get("Last Price", "")),
        current_value=current_value,
        total_gl_dollar=total_gl_dollar,
        total_gl_pct=total_gl_pct,
    )


@router.post("/detect")
async def detect_broker(file: UploadFile = File(...)):
    """Sniff the first line of the CSV and return detected broker."""
    first_chunk = await file.read(2048)
    first_line = first_chunk.decode("utf-8-sig").splitlines()[0]
    headers = [h.strip() for h in first_line.split(",")]
    broker = _detect_broker(headers)
    return {"broker": broker}


@router.post("/import")
async def import_portfolio(
    file: UploadFile = File(...),
    account_label: str = Form(""),
    db: Session = Depends(get_db),
):
    content = (await file.read()).decode("utf-8-sig")
    clean_lines = [l for l in content.splitlines() if not l.startswith('"')]
    reader = csv.DictReader(io.StringIO("\n".join(clean_lines)))

    headers = reader.fieldnames or []
    broker = _detect_broker(list(headers))

    positions_data = []
    for row in reader:
        if broker == "etrade":
            parsed = _parse_etrade_row(row, account_label)
        elif broker == "etrade_espp":
            parsed = _parse_espp_row(row)
        else:
            parsed = _parse_fidelity_row(row)
        if parsed:
            positions_data.append(parsed)

    # Smart clear: replace only the imported broker's data
    if broker == "etrade" and account_label:
        db.query(PortfolioPosition).filter(
            PortfolioPosition.broker == "etrade",
            PortfolioPosition.account_name == (account_label or "E*Trade"),
        ).delete()
    elif broker == "etrade_espp":
        db.query(PortfolioPosition).filter(
            PortfolioPosition.broker == "etrade_espp"
        ).delete()
    else:
        db.query(PortfolioPosition).filter(
            PortfolioPosition.broker == broker
        ).delete()

    db.add_all([PortfolioPosition(**p) for p in positions_data])
    db.commit()

    return {
        "imported": len(positions_data),
        "broker": broker,
        "message": f"Imported {len(positions_data)} positions from {broker.title()}",
    }


@router.get("/")
def get_portfolio(db: Session = Depends(get_db)):
    positions = db.query(PortfolioPosition).order_by(PortfolioPosition.current_value.desc()).all()

    unique_tickers = list({p.ticker for p in positions if p.ticker not in CASH_SYMBOLS})
    analyses: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(get_stock_analysis, ticker): ticker for ticker in unique_tickers}
        for future in as_completed(futures):
            ticker = futures[future]
            try:
                result = future.result()
                analyses[ticker] = result if "error" not in result else None
            except Exception:
                analyses[ticker] = None

    return [
        {
            "id": p.id,
            "broker": p.broker or "fidelity",
            "account_number": p.account_number,
            "account_name": p.account_name,
            "ticker": p.ticker,
            "company_name": p.company_name,
            "shares": p.shares,
            "avg_cost": p.avg_cost,
            "cost_basis_total": p.cost_basis_total,
            "last_price": p.last_price,
            "current_value": p.current_value,
            "total_gl_dollar": p.total_gl_dollar,
            "total_gl_pct": p.total_gl_pct,
            "imported_at": p.imported_at.isoformat() if p.imported_at else None,
            "analysis": analyses.get(p.ticker),
        }
        for p in positions
    ]


@router.get("/summary")
def get_summary(db: Session = Depends(get_db)):
    positions = db.query(PortfolioPosition).all()
    total_value = sum(p.current_value or 0 for p in positions)
    total_gl = sum(p.total_gl_dollar or 0 for p in positions)
    total_cost = sum(p.cost_basis_total or 0 for p in positions)
    total_gl_pct = (total_gl / total_cost * 100) if total_cost > 0 else 0

    accounts: dict = {}
    for p in positions:
        key = p.account_name
        if key not in accounts:
            accounts[key] = {"value": 0, "gl": 0, "count": 0, "broker": p.broker or "fidelity"}
        accounts[key]["value"] += p.current_value or 0
        accounts[key]["gl"] += p.total_gl_dollar or 0
        accounts[key]["count"] += 1

    return {
        "total_value": round(total_value, 2),
        "total_gl_dollar": round(total_gl, 2),
        "total_gl_pct": round(total_gl_pct, 2),
        "total_cost": round(total_cost, 2),
        "position_count": len(positions),
        "accounts": {k: {kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()} for k, v in accounts.items()},
    }


@router.delete("/")
def clear_portfolio(db: Session = Depends(get_db)):
    db.query(PortfolioPosition).delete()
    db.commit()
    return {"message": "Portfolio cleared"}
