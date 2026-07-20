# 공통 개발환경 정리 계획

## 목표

메인 컴퓨터, 서브 컴퓨터, Claude/Codex가 로컬에 남아 있는 서로 다른 커밋을 기준으로 작업하지 않고, GitHub의 `origin/main`을 단일 기준점으로 삼아 안전하게 동기화하고 작업하도록 만든다.

## 현재 확인된 문제

- 현재 checkout의 `main`이 최신 `origin/main`보다 7커밋 뒤에 있다.
- 여러 기존 worktree와 작업 브랜치가 서로 다른 과거 커밋을 가리킨다.
- `.codex-worktrees/`와 `.codex-remote-attachments/`가 저장소 상태에 미추적 파일로 나타나 작업 변경과 환경 산출물이 섞인다.
- 기존 문서가 특정 컴퓨터의 절대 경로를 canonical checkout으로 전제한다.
- 원격 fetch/pull 정책과 `main` 동기화 여부를 한 번에 확인할 표준 명령이 없다.

## 설계 결정

1. 공유 Source of Truth는 특정 컴퓨터의 폴더가 아니라 `origin/main`으로 고정한다.
2. 모든 checkout은 작업 시작 전에 fetch 후 `main`을 fast-forward 동기화한다. 자동 reset, force push, 로컬 변경 삭제는 하지 않는다.
3. 실제 작업은 `origin/main`에서 만든 고유 작업 브랜치/worktree에서 수행한다. `main`은 통합 전용으로 둔다.
4. 저장소에 재현 가능한 `setup:repository`, `sync:development`, `check:development` 명령을 제공한다.
5. 환경 전용 worktree와 원격 첨부 파일은 Git 추적 대상에서 제외한다.
6. 기존 작업 브랜치와 worktree는 안전성 확인 없이 삭제·rebase·cherry-pick하지 않는다.

## 실행 범위

### Slice 1 — 저장소 자동화와 무시 규칙

- `scripts/install-repository-guard.mjs`에 fast-forward-only, prune, push 정책을 설정한다.
- `scripts/sync-development.mjs`를 추가해 깨끗한 `main`만 `origin/main`으로 안전하게 동기화한다.
- `scripts/check-development-sync.mjs`를 추가해 원격/브랜치/commit/작업 트리 상태를 검사한다.
- `package.json`에 setup/sync/check 명령을 등록한다.
- `.gitignore`에 환경 전용 산출물을 추가한다.

### Slice 2 — 사람과 AI가 읽는 협업 규칙

- `docs/SHARED_DEVELOPMENT.md`에 메인 컴퓨터·서브 컴퓨터·Claude/Codex의 역할과 시작/작업/인계 절차를 기록한다.
- `AGENTS.md`와 `CLAUDE.md`에 `origin/main` 단일 기준점과 동기화 명령을 연결한다.
- `docs/ai/NEXT_ACTION.md`에 이 계획의 실행/검토 상태를 남긴다.

## 구현하지 않는 범위

- 기존 작업 브랜치의 내용 통합 또는 삭제
- 다른 컴퓨터의 로컬 checkout을 원격으로 직접 조작
- 애플리케이션 기능, UI, Firebase 데이터 모델 변경
- 자동 commit, 자동 rebase, force push, `git reset --hard`, `git clean`

## 검증

- 저장소 boundary 검사와 새 sync/check 스크립트 실행
- 깨끗한 task worktree에서 `origin/main`과 HEAD가 같은지 확인
- `npm.cmd run check:syntax` 및 관련 Node 테스트 실행
- 현재 checkout의 기존 untracked 환경 파일이 `.gitignore`에 의해 더 이상 작업 상태를 오염시키지 않는지 확인
- 최종 검토에서 변경 파일, 안전장치, 기존 worktree 보존 여부를 확인

## 상태

- 계획: 완료
- 실행: 완료
- 검토: 대기
