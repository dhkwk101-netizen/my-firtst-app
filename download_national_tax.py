import json
import os
import subprocess
import time

tables = [
    ("TX_11007_A058", "서울특별시"),
    ("TX_11007_A059", "부산광역시"),
    ("TX_11007_A060", "대구광역시"),
    ("TX_11007_A061", "인천광역시"),
    ("TX_11007_A062", "광주광역시"),
    ("TX_11007_A063", "대전광역시"),
    ("TX_11007_A064", "울산광역시"),
    ("TX_11007_A065", "경기도"),
    ("TX_11007_A066", "강원특별자치도"),
    ("TX_11007_A067", "충청북도"),
    ("TX_11007_A068", "충청남도"),
    ("TX_11007_A069", "전북특별자치도"),
    ("TX_11007_A070", "전라남도"),
    ("TX_11007_A071", "경상북도"),
    ("TX_11007_A072", "경상남도"),
    ("TX_11007_A073", "제주특별자치도"),
]

os.makedirs("var/raw/national_tax", exist_ok=True)
all_collected = {}

for tbl_id, name in tables:
    out_file = f"var/raw/national_tax/{tbl_id}.json"
    if os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
        print(f"Skipping {tbl_id} ({name}), already downloaded.")
        continue

    print(f"Downloading {tbl_id} ({name}) for 2010-2024...")
    url = (
        "https://kosis.kr/openapi/Param/statisticsParameterData.do"
        f"?method=getList&apiKey=NmIwYmQzZWNkMTUzNWEyZmQwY2RkMjhhNzI0NzM4MWE=&orgId=110&tblId={tbl_id}"
        "&itmId=ALL&objL1=ALL&objL2=ALL&prdSe=Y&startPrdDe=2010&endPrdDe=2024&format=json&jsonVD=Y"
    )
    cmd = ["curl.exe", "-s", "--cacert", r"D:\zscaler_root.pem", url, "-o", out_file]
    subprocess.run(cmd)

    try:
        with open(out_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                print(f"  -> SUCCESS: {len(data)} rows.")
            else:
                print(f"  -> RESPONSE: {data}")
    except Exception as e:
        print(f"  -> ERROR reading {out_file}: {e}")

    time.sleep(0.4)

print("Finished downloading national provincial/municipal tax tables!")
