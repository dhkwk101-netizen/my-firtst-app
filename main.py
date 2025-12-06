import flet as ft

def main(page: ft.Page):
    # 앱의 제목을 설정합니다.
    page.title = "나의 첫 모바일 앱"
    
    # 모바일 기기에서 보기 좋게 테마를 설정합니다. (다크 모드 등)
    page.theme_mode = ft.ThemeMode.LIGHT
    
    # 화면의 내용을 중앙에 정렬합니다.
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER

    # 숫자를 보여줄 텍스트 요소를 만듭니다. 글자 크기는 50으로 크게 설정합니다.
    number_text = ft.Text(value="0", size=50, weight=ft.FontWeight.BOLD)

    # 더하기 버튼을 눌렀을 때 실행될 함수(기능)입니다.
    def plus_click(e):
        # 현재 텍스트의 값을 가져와서 정수(숫자)로 바꿉니다.
        current_value = int(number_text.value)
        # 숫자에 1을 더하고 다시 문자열(글자)로 바꿔서 저장합니다.
        number_text.value = str(current_value + 1)
        # 화면을 갱신(새로고침)하여 변경된 숫자를 사용자에게 보여줍니다.
        page.update()

    # 빼기 버튼을 눌렀을 때 실행될 함수입니다.
    def minus_click(e):
        current_value = int(number_text.value)
        number_text.value = str(current_value - 1)
        page.update()

    # 화면에 요소들을 추가합니다. 
    # Row는 가로로 요소들을 배치하는 컨테이너입니다.
    page.add(
        ft.Column(
            [
                ft.Text("숫자 카운터", size=20, color="bluegrey"),
                ft.Row(
                    [
                        # 빼기 아이콘 버튼
                        ft.IconButton(ft.Icons.REMOVE, on_click=minus_click, icon_size=30),
                        # 숫자 텍스트
                        number_text,
                        # 더하기 아이콘 버튼
                        ft.IconButton(ft.Icons.ADD, on_click=plus_click, icon_size=30),
                    ],
                    alignment=ft.MainAxisAlignment.CENTER
                ),
                ft.Text("버튼을 눌러보세요!", size=14, color="grey"),
            ],
            alignment=ft.MainAxisAlignment.CENTER,
            horizontal_alignment=ft.CrossAxisAlignment.CENTER
        )
    )

# 앱을 실행합니다.
# view=ft.AppView.WEB_BROWSER 옵션을 주면 브라우저에서 열리고, 
# 생략하면 데스크톱 앱 창으로 열립니다.
print("앱을 시작합니다...")
ft.app(target=main, view=ft.AppView.WEB_BROWSER)
