#!/usr/bin/env bash
# =============================================================
# مسح ملف فيه بيانات شخصية (PII) من تاريخ Git بالكامل
# =============================================================
#
# حذف الملف من آخر كوميت مش كفاية — الملف لسه موجود في التاريخ
# وأي حد يقدر يرجّعه بـ `git show <old-commit>:<file>`.
#
# ⚠️ السكربت ده بيعمل force-push وبيغيّر كل الـ commit hashes.
#    نفّذه على مسؤوليتك، وبعد ما تتأكد إن عندك نسخة احتياطية.
#
# الاستخدام:
#   bash scripts/purge-pii.sh "kids zone excel sheet.xlsx"
#
# المتطلبات:
#   pip install git-filter-repo     (أو: brew install git-filter-repo)
# =============================================================

set -euo pipefail

FILE_PATH="${1:-kids zone excel sheet.xlsx}"
REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "============================================================="
echo " مسح ملف من تاريخ Git: $FILE_PATH"
echo "============================================================="

if ! git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  echo "❌ مش جوه مستودع git" >&2
  exit 1
fi

# 1) تأكيد إن الملف فعلاً في التاريخ
if ! git -C "$REPO_ROOT" log --all --oneline -- "$FILE_PATH" | head -1 | grep -q .; then
  echo "ℹ️  الملف مش موجود في التاريخ — مفيش حاجة تعملها."
  exit 0
fi

echo ""
echo "الكوميتات اللي فيها الملف:"
git -C "$REPO_ROOT" log --all --oneline -- "$FILE_PATH"
echo ""
echo "⚠️  تحذير: العملية دي هتغيّر كل الـ commit hashes من أول ظهور الملف."
echo "⚠️  لازم كل اللي شغالين على الريبو يعملوا clone من جديد بعدها."
read -r -p "كمّل؟ (اكتب YES للتأكيد) " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "اتلغى."
  exit 1
fi

# 2) نسخة احتياطية قبل أي حاجة
BACKUP_DIR="${REPO_ROOT}/../$(basename "$REPO_ROOT")-backup-$(date +%Y%m%d-%H%M%S)"
echo ""
echo "📦 نسخة احتياطية في: $BACKUP_DIR"
git -C "$REPO_ROOT" clone --mirror "$REPO_ROOT" "$BACKUP_DIR" 2>/dev/null || \
  cp -r "$REPO_ROOT/.git" "$BACKUP_DIR-git"

# 3) المسح
if command -v git-filter-repo >/dev/null 2>&1; then
  echo "🧹 git-filter-repo …"
  git -C "$REPO_ROOT" filter-repo --path "$FILE_PATH" --invert-paths --force
elif command -v bfg >/dev/null 2>&1; then
  echo "🧹 bfg …"
  bfg --delete-files "$(basename "$FILE_PATH")" "$REPO_ROOT"
  git -C "$REPO_ROOT" reflog expire --expire=now --all
  git -C "$REPO_ROOT" gc --prune=now --aggressive
else
  echo "❌ محتاج git-filter-repo أو bfg:" >&2
  echo "    pip install git-filter-repo" >&2
  echo "    (أو) brew install bfg" >&2
  exit 1
fi

# 4) التأكد
echo ""
if git -C "$REPO_ROOT" log --all --oneline -- "$FILE_PATH" | head -1 | grep -q .; then
  echo "❌ الملف لسه موجود في التاريخ — راجع الخطوات."
  exit 1
fi
echo "✅ الملف ات مسح من التاريخ."

# 5) الرفع
echo ""
read -r -p "اعمل force-push لكل البرانشات؟ (اكتب PUSH للتأكيد) " DOPUSH
if [ "$DOPUSH" = "PUSH" ]; then
  REMOTE="$(git -C "$REPO_ROOT" remote | head -1)"
  git -C "$REPO_ROOT" push "$REMOTE" --force --all
  git -C "$REPO_ROOT" push "$REMOTE" --force --tags
  echo "✅ اتعمل force-push."
else
  echo "ℹ️  ما عملتش push. لما تجهز نفّذ:"
  echo "    git push origin --force --all && git push origin --force --tags"
fi

cat <<'AFTER'

=============================================================
 خطوات لازم تعملها بعد المسح (مهمة):
=============================================================
 1. حوّل الريبو لـ Private:
      gh repo edit --visibility private
    (أو من Settings → Danger Zone → Change visibility)

 2. لو في أي forks: GitHub بيحتفظ بنسخهم. اتصل بدعم GitHub
    لطلب مسح الـ cached views، أو امسح الريبو واعمله من جديد.

 3. غيّر أي مفاتيح/أسرار كانت في الريبو (Supabase keys, tokens) —
    اعتبرها مكشوفة حتى لو ات مسحت من التاريخ.

 4. بلّغ أصحاب البيانات لو البيانات اتكشفت لفترة (أسماء أولياء أمور/طلاب).

 5. أضف حماية للمستقبل:
      - .gitignore فيه *.xlsx / *.csv (متعمل بالفعل)
      - pre-commit hook يفحص الملفات الكبيرة/البيانات
      - استخدم docs/samples/sample-sheet.xlsx (أسماء وهمية) للتجارب
AFTER
