import glob
import json
import os
import django
import sys

sys.stdout.reconfigure(encoding='utf-8')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from explorer.models import Region, RegionName

files = sorted(glob.glob("var/raw/national_tax/TX_11007_A*.json"))
all_matched = 0
all_unmatched = []

for fpath in files:
    fname = os.path.basename(fpath)
    if "_p" in fname:
        continue
    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Get all C1 districts
    districts = {}
    for r in data:
        c1 = r.get("C1")
        nm = r.get("C1_NM", "")
        if c1 not in districts:
            districts[c1] = nm

    print(f"\n[{fname}] {len(districts)} districts:")
    matched_in_file = 0
    for c1, nm in districts.items():
        if nm in ("합계", "총계", "시세", "도세", "군세", "구세") or "본청" in nm or "도" in nm and len(nm) <= 4:
            continue
        # Search by exact name or strip
        clean_nm = nm.replace(" ", "").strip()
        rn = RegionName.objects.filter(name=clean_nm, is_official=True).first()
        if not rn:
            # Try partial match or startswith
            rn = RegionName.objects.filter(name__startswith=clean_nm[:2], is_official=True).first()
        
        if rn:
            matched_in_file += 1
            all_matched += 1
        else:
            all_unmatched.append((fname, c1, nm))
            print(f"   UNMATCHED: {c1} ({nm})")
    print(f"   Matched: {matched_in_file}")

print(f"\nTOTAL MATCHED: {all_matched}, UNMATCHED: {len(all_unmatched)}")
