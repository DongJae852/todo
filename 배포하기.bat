@echo off
chcp 65001 > NUL
echo ==================================================
echo   동재 Todo - Vercel 클라우드 배포 자동화
echo ==================================================
echo.
echo [1/4] Vercel 계정에 로그인합니다...
echo (브라우저가 열리면 가입하신 Github 등으로 로그인해 주세요.)
call npx vercel login
if errorlevel 1 goto error

echo.
echo [2/4] Vercel 프로젝트 생성 및 링크를 수행합니다...
call npx vercel link --yes
if errorlevel 1 goto error

echo.
echo [3/4] Firebase 환경 변수를 Vercel 서버에 등록합니다...
echo (이미 등록된 경우 덮어씁니다.)
echo VITE_FIREBASE_API_KEY 등록 중...
echo AIzaSyDxqP4iJZlSZjCTg6vysyBvzM_fZkoZZD8 | npx vercel env add VITE_FIREBASE_API_KEY production
echo VITE_FIREBASE_AUTH_DOMAIN 등록 중...
echo dongjae-todo.firebaseapp.com | npx vercel env add VITE_FIREBASE_AUTH_DOMAIN production
echo VITE_FIREBASE_PROJECT_ID 등록 중...
echo dongjae-todo | npx vercel env add VITE_FIREBASE_PROJECT_ID production
echo VITE_FIREBASE_STORAGE_BUCKET 등록 중...
echo dongjae-todo.firebasestorage.app | npx vercel env add VITE_FIREBASE_STORAGE_BUCKET production
echo VITE_FIREBASE_MESSAGING_SENDER_ID 등록 중...
echo 232110760055 | npx vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID production
echo VITE_FIREBASE_APP_ID 등록 중...
echo 1:232110760055:web:f8ee1422c3e33d93d36672 | npx vercel env add VITE_FIREBASE_APP_ID production

echo.
echo [4/4] Vercel 클라우드 빌드 및 실시간 배포를 시작합니다...
call npx vercel deploy --prod --yes
if errorlevel 1 goto error

echo.
echo ==================================================
echo  🎉 Vercel 배포 완료! 위 화면의 Production URL을 확인하세요.
echo ==================================================
goto end

:error
echo.
echo [오류] 배포 도중 문제가 발생했습니다. 에러 메시지를 확인해 주세요.
echo.

:end
pause
