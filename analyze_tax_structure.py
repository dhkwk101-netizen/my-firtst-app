import glob
import json
import os
import sys

files = sorted(glob.glob("var/raw/national_tax/TX_11007_A*.json"))
print(f"Analyzing {len(files)} provincial tax files...")

for fpath in files:
    fname = os.path.basename(fpath)
    if "_p" in fname:
        continue
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            print(f"  {fname}: NOT A LIST ({data})")
            continue

        # Look for 취득세 in C1 or C2
        c1_matches = set()
        c2_matches = set()
        c1_names = set()
        itm_names = set()

        for r in data:
            c1_nm = r.get("C1_NM", "")
            c2_nm = r.get("C2_NM", "")
            if "취득세" in c1_nm:
                c1_matches.add((r.get("C1"), c1_nm))
            if "취득세" in c2_nm:
                c2_matches.add((r.get("C2"), c2_nm))
            c1_names.add(c1_nm)
            itm_names.add(r.get("ITM_NM", ""))

        tbl_nm = data[0].get("TBL_NM", "")
        print(f"[{fname}] {tbl_nm}: {len(data)} rows, {len(c1_names)} districts")
        if c2_matches:
            print(f"   -> 취득세 is in C2: {c2_matches}")
        elif c1_matches:
            print(f"   -> 취득세 is in C1: {c1_matches}")
        else:
            print(f"   -> WARNING: 취득세 not found!")

    except Exception as e:
        print(f"  {fname}: ERROR {e}")
