from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
import io
from app.models.database import get_db, PortfolioPosition
from app.services.stock_analyzer import get_stock_analysis

router = APIRouter()

# Symbols to skip: cash, money market funds, pending rows
SKIP_SYMBOLS = {"FCASH**", "FDRXX**", "SPAXX**", "SPAXX", "FDRXX", "FCASH"}


def _parse_money(val: str):
    """Strip Fidelity formatting ($, +, %, commas) and return float or None."""
    if not val or val.strip() in ("--", "", "N/A"):
        return None
    cleaned = val.strip().replace("$", "").replace(",", "").replace("+", "").replace("%", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


@router.post("/import")
def import_portfolio(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = file.file.read().decode("utf-8-sig")  # utf-8-sig strips BOM from Fidelity exports
    # Strip trailing junk lines (Fidelity disclaimer rows start with '"')
    clean_lines = [l for l in content.splitlines() if not l.startswith('"')]
    reader = csv.DictReader(io.StringIO("\n".join(clean_lines)))

    positions = []
    for row in reader:
        symbol = row.get("Symbol", "").strip()

        # Skip cash, money market, empty symbols, pending rows
        if not symbol or symbol in SKIP_SYMBOLS or "Pending" in symbol:
            continue
        # Skip rows that have no account number (footer artifacts)
        if not row.get("Account Number", "").strip():
            continue

        shares = _parse_money(row.get("Quantity", ""))
        if shares is None or shares <= 0:
            continue

        positions.append(PortfolioPosition(
            account_number=row.get("Account Number", "").strip(),
            account_name=row.get("Account Name", "").strip(),
            ticker=symbol.upper(),
            company_name=row.get("Description", "").strip(),
            shares=shares,
            avg_cost=_parse_money(row.get("Average Cost Basis", "")),
            cost_basis_total=_parse_money(row.get("Cost Basis Total", "")),
            last_price=_parse_money(row.get("Last Price", "")),
            current_value=_parse_money(row.get("Current Value", "")),
            total_gl_dollar=_parse_money(row.get("Total Gain/Loss Dollar", "")),
            total_gl_pct=_parse_money(row.get("Total Gain/Loss Percent", "")),
        ))

    # Replace all existing positions on each import
    db.query(PortfolioPosition).delete()
    db.add_all(positions)
    db.commit()

    return {"imported": len(positions), "message": f"Imported {len(positions)} positions"}


@router.get("/")
def get_portfolio(db: Session = Depends(get_db)):
    positions = db.query(PortfolioPosition).order_by(PortfolioPosition.current_value.desc()).all()

    # Deduplicate tickers before fetching (same stock can appear in multiple accounts)
    unique_tickers = list({p.ticker for p in positions})
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
        if p.account_name not in accounts:
            accounts[p.account_name] = {"value": 0, "gl": 0, "count": 0}
        accounts[p.account_name]["value"] += p.current_value or 0
        accounts[p.account_name]["gl"] += p.total_gl_dollar or 0
        accounts[p.account_name]["count"] += 1

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
