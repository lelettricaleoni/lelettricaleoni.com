#!/usr/bin/env bash
# Merges PR $1 (squash) only when every check has finished and succeeded on the SAME commit that was pushed ($2); deletes the remote
# branch only after reading MERGED. Gives up (and says why) after about 25 minutes. Never forces anything.
# Usage (in the background, after opening a PR): scripts/merge-when-green.sh <pr> <headSha> <branch>
pr="$1"; head="$2"; branch="$3"
cd "$(git rev-parse --show-toplevel)" || exit 1
q() { gh pr view "$pr" --json "$1" --jq "$2"; }
for i in $(seq 1 50); do
  state=$(q state .state)
  [ "$state" = "MERGED" ] && { echo "already merged"; break; }
  [ "$state" != "OPEN" ] && { echo "PR is $state: nothing done"; exit 1; }
  oid=$(q headRefOid .headRefOid)
  [ "$oid" != "$head" ] && { echo "head moved ($oid): nothing done"; exit 1; }
  pending=$(q statusCheckRollup '[.statusCheckRollup[] | select(.status != "COMPLETED")] | length')
  failed=$(q statusCheckRollup '[.statusCheckRollup[] | select(.status == "COMPLETED" and (.conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != "NEUTRAL"))] | length')
  total=$(q statusCheckRollup '.statusCheckRollup | length')
  merge_state=$(q mergeStateStatus .mergeStateStatus)
  if [ "$failed" -gt 0 ]; then echo "a check FAILED: nothing merged"; q statusCheckRollup '.statusCheckRollup[] | select(.conclusion=="FAILURE") | .name'; exit 1; fi
  if [ "$pending" -eq 0 ] && [ "$total" -gt 0 ] && [ "$merge_state" = "CLEAN" ]; then
    gh pr merge "$pr" --squash || { echo "merge refused"; exit 1; }
    break
  fi
  sleep 30
done
state=$(q state .state)
if [ "$state" = "MERGED" ]; then
  git push origin --delete "$branch" 2>&1 | tail -1
  echo "MERGED and branch deleted"
else
  echo "gave up, PR is $state"; exit 1
fi
