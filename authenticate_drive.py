import os
import sys
import ssl
import urllib3
import requests
from requests.adapters import HTTPAdapter

# 1. Global SSL bypass for corporate proxy (Zscaler) in Python 3.14
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
ssl._create_default_https_context = ssl._create_unverified_context

# 2. Patch HTTPAdapter to force verify=False on urllib3 connection level
class NoVerifyHTTPAdapter(HTTPAdapter):
    def cert_verify(self, conn, url, verify, cert):
        super().cert_verify(conn, url, verify=False, cert=cert)

orig_session_init = requests.Session.__init__
def patched_session_init(self, *args, **kwargs):
    orig_session_init(self, *args, **kwargs)
    self.mount("https://", NoVerifyHTTPAdapter())
    self.verify = False

requests.Session.__init__ = patched_session_init

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
os.environ["PYTHONHTTPSVERIFY"] = "0"

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/drive"]
CLIENT_SECRET_FILE = r"D:\kosis\client_secret.json"
TOKEN_FILE = r"D:\kosis\token.json"

def authenticate_google_drive():
    print("=" * 60)
    print("🔑 Google Drive OAuth2 인증을 시작합니다.")
    print("브라우저가 열리면 로그인 후 [허용]을 눌러주세요.")
    print("=" * 60)

    flow = InstalledAppFlow.from_client_secrets_file(
        CLIENT_SECRET_FILE,
        scopes=SCOPES
    )

    if hasattr(flow, "oauth2session") and flow.oauth2session:
        flow.oauth2session.mount("https://", NoVerifyHTTPAdapter())
        flow.oauth2session.verify = False

    creds = flow.run_local_server(port=0, open_browser=True)

    with open(TOKEN_FILE, "w", encoding="utf-8") as f:
        f.write(creds.to_json())

    print(f"\n🎉 [성공] 인증 완료! 토큰이 {TOKEN_FILE}에 안전하게 저장되었습니다.")
    print("이제 본인 계정 구글 드라이브(STATRACE 폴더)로 제한 없이 바로 자동 저장됩니다!")

if __name__ == "__main__":
    authenticate_google_drive()
