import subprocess
import json
import time

sido_tables = {}
for i in range(58, 75):
    tbl_id = f"TX_11007_A{i:03d}"
    cmd = [
        "curl.exe", "-s", "--cacert", r"D:\zscaler_root.pem",
        f"https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=NmIwYmQzZWNkMTUzNWEyZmQwY2RkMjhhNzI0NzM4MWE=&orgId=110&tblId={tbl_id}&itmId=ALL&objL1=ALL&objL2=ALL&prdSe=Y&startPrdDe=2024&endPrdDe=2024&format=json&jsonVD=Y"
    ]
    res = subprocess.run(cmd, capture_output=True)
    try:
        data = json.loads(res.stdout.decode('utf-8'))
        if isinstance(data, list) and len(data) > 0:
            tbl_nm = data[0].get("TBL_NM")
            c1_sample = data[0].get("C1_NM")
            c1_count = len(set(r.get("C1") for r in data))
            c2_count = len(set(r.get("C2") for r in data))
            sido_tables[tbl_id] = {
                "tbl_nm": tbl_nm,
                "row_count": len(data),
                "districts_count": c1_count,
                "taxes_count": c2_count,
                "sample_district": c1_sample,
            }
            print(f"FOUND {tbl_id}: {tbl_nm} ({c1_count} districts, {len(data)} rows)")
        else:
            print(f"FAILED {tbl_id}: {data}")
    except Exception as e:
        print(f"ERROR {tbl_id}: {e}")
    time.sleep(0.4)

with open("var/sido_tables.json", "w", encoding="utf-8") as f:
    json.dump(sido_tables, f, ensure_ascii=False, indent=2)
print("Saved to var/sido_tables.json successfully!")
