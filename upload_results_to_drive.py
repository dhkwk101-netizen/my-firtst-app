import os
import sys
import zipfile
from pathlib import Path
from explorer.drive_client import drive_client, DEFAULT_FOLDER_ID

def archive_and_upload(
    source_dir: str = "var/raw",
    archive_name: str = "kosis_raw_dataset.zip",
    folder_id: str = DEFAULT_FOLDER_ID
):
    source_path = Path(source_dir)
    if not source_path.exists():
        print(f"Directory {source_dir} does not exist.")
        return

    os.makedirs("var/exports", exist_ok=True)
    zip_path = Path("var/exports") / archive_name

    print(f"[Archive] Compressing {source_dir} -> {zip_path}...")
    file_count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(source_path):
            for file in files:
                full_file_path = Path(root) / file
                rel_path = full_file_path.relative_to(source_path)
                zf.write(full_file_path, arcname=str(rel_path))
                file_count += 1

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"[Archive] Created zip with {file_count} files ({size_mb:.2f} MB)")

    print(f"[Upload] Uploading to Google Drive folder: {folder_id}...")
    try:
        res = drive_client.upload_file(
            local_path=zip_path,
            remote_name=archive_name,
            folder_id=folder_id,
            overwrite=True
        )
        print(f"[Success] Successfully uploaded to Google Drive! File ID: {res.get('id')}")
        if res.get("webViewLink"):
            print(f"[Link] View link: {res.get('webViewLink')}")
        return res
    except Exception as e:
        print(f"[Error] Google Drive upload error: {e}")
        raise e


if __name__ == "__main__":
    archive_and_upload()
