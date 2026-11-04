# LOL Broadcast HUD

리그 오브 레전드 대회용 OBS 밴픽, 인게임 HUD 및 결과 화면입니다. 웹 밴픽, BO5 하드 피어리스와 RoFS를 지원합니다.

## 실행

Windows 10/11 64비트와 Node.js 24가 필요합니다. 이 저장소에는 Node.js 실행 파일이 포함되지 않습니다.

```powershell
node server.js
```

실행 창을 유지하고 브라우저에서 `http://127.0.0.1:3197/control.html`을 여세요. OBS 브라우저 소스 주소는 `/draft.html`, `/ingame.html`, `/result.html`이며 1920×1080으로 설정합니다. 처음 챔피언 데이터를 불러올 때 인터넷 연결이 필요합니다.

외부 웹 밴픽을 사용하려면 공식 Cloudflare `cloudflared.exe`를 `runtime/cloudflared.exe`에 준비한 뒤 컨트롤 화면에서 외부 접속을 시작하세요. 팀 링크는 해당 팀에게만 전달하세요. 로컬 서버가 실행 중이어야 합니다.

`data/state.example.json`은 개인 경기 정보를 제거한 초기 설정입니다. 첫 실행 시 로컬 `data/state.json`이 생성되며 Git에서 제외됩니다. 실행 중 생성된 경기 정보와 팀 링크, 업로드 파일은 공개하지 마세요. 이미지 인식은 화면 배치와 해상도에 영향을 받으므로 경기 전에 테스트하세요.

League of Legends와 관련 이미지 및 명칭은 Riot Games의 자산입니다. 이 프로젝트는 Riot Games의 공식 제품이 아닙니다.
