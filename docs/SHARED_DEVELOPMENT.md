# 공통 개발환경 운영 규칙

이 저장소에서 메인 컴퓨터, 서브 컴퓨터, Claude/Codex가 바라보는 유일한 공통 기준점은 GitHub의 `origin/main`이다. 특정 컴퓨터의 폴더, 오래된 로컬 `main`, Codex가 만든 임시 worktree는 기준점이 아니다.

## 핵심 원칙

- `origin/main`은 통합된 최신 소스의 단일 기준점이다.
- 각 컴퓨터는 저장소를 별도로 clone하고, `.git` 폴더나 로컬 worktree를 컴퓨터 사이에 복사하지 않는다.
- `main`은 통합 전용이다. 실제 작업은 최신 `origin/main`에서 만든 작업 branch/worktree에서 한다.
- 작업 branch가 자신의 커밋 때문에 `origin/main`과 달라지는 것은 정상이다. 다만 작업 시작 시점의 base는 반드시 최신 `origin/main`이어야 한다.
- 자동 `reset`, `clean`, force push, 자동 rebase는 사용하지 않는다. 변경이 있으면 먼저 사용자에게 보여주고 안전하게 commit/stash/move한다.

## 새 컴퓨터 또는 새 checkout 준비

프로젝트 루트에서 실행한다.

```powershell
npm.cmd ci
npm.cmd run setup:repository
npm.cmd run sync:development
npm.cmd run check:development
```

`sync:development`는 다음 조건을 모두 만족할 때만 동작한다.

- 현재 branch가 `main`이다.
- 추적 파일과 추적되지 않은 일반 파일에 변경이 없다.
- 원격이 `origin` 하나뿐이고 Tomato Farm 저장소를 가리킨다.

그 뒤 `origin`을 fetch하고 `main`을 `--ff-only`로만 갱신한다. 따라서 서로 다른 커밋을 임의로 합치거나 작업물을 지우지 않는다.

## 매 작업 시작

통합 checkout 또는 깨끗한 `main`에서 다음을 실행한다.

```powershell
npm.cmd run sync:development
npm.cmd run check:development
git rev-parse --short HEAD
git rev-parse --short origin/main
```

`main` checkout에서는 마지막 두 값이 같아야 한다. 다르면 코드를 수정하지 말고 먼저 `sync:development` 결과를 확인한다.

Claude/Codex가 작업을 시작할 때도 같은 검사를 한다. 현재 checkout이 이미 작업 branch이거나 변경 중이면 `main`을 억지로 바꾸지 말고, 해당 작업 branch가 최신 `origin/main`을 base로 하는지 `check:development`로 확인한다.

## 작업과 인계

작업마다 고유한 branch를 만든다.

```powershell
git fetch origin --prune
git switch main
git pull --ff-only origin main
git switch -c codex/<작업이름> origin/main
```

작업이 끝나면 변경 파일을 확인하고 branch만 push한다.

```powershell
git status --short
git add <변경 파일>
git commit -m "<conventional commit message>"
git push -u origin codex/<작업이름>
```

다음 컴퓨터나 Claude가 이어서 작업할 때는 그 branch를 직접 checkout하거나, 통합된 경우 다시 최신 `origin/main`에서 새 branch를 만든다. 서로 다른 로컬 branch를 같은 이름이라고 가정하지 않는다.

## 통합 담당

메인 컴퓨터의 통합 checkout 한 곳만 `main`을 갱신하고 `origin/main`에 push한다.

```powershell
git switch main
npm.cmd run sync:development
git fetch origin --prune
git log --oneline origin/main..main
git diff --stat origin/main...main
npm.cmd run check:repository
git push origin main
```

실제 통합은 검토된 작업 commit 또는 Pull Request만 대상으로 한다. 통합 후 다른 컴퓨터와 Claude는 다시 `npm.cmd run sync:development`를 실행해 같은 `origin/main`을 바라본다.

## 충돌·오래된 작업 발견 시

- `main`이 `origin/main`보다 뒤면 `sync:development`로 fast-forward한다.
- `main`에 로컬 커밋이 있거나 작업 파일이 남아 있으면 자동 병합하지 않고 통합 담당에게 보고한다.
- 작업 branch의 base가 오래됐으면 새 최신 branch를 만들거나, 작업 소유자가 검토 가능한 방식으로 rebase/merge한다.
- 기존 worktree를 삭제하거나 branch를 rebase/cherry-pick/reset하기 전에 그 worktree의 소유자와 미커밋 변경을 확인한다.
- `.codex-worktrees/`와 `.codex-remote-attachments/`는 환경 산출물이며 commit하지 않는다.

상태 확인 명령의 정상 예시는 다음과 같다.

```text
[development-check] ok branch=main head=d93f1c9f... origin/main=d93f1c9f...
```
