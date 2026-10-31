#!/usr/bin/env bash
set -euo pipefail
revision=11d8a49540634249094b2c92c3ee1a3aa3d3b4ca
target="${1:?Usage: prepare.sh NEW_BUILD_DIRECTORY}"
if [[ -e "$target" ]]; then echo 'Build directory already exists; refusing to overwrite' >&2; exit 1; fi
git clone https://github.com/audreyt/ethercalc.git "$target"
git -C "$target" checkout --detach "$revision"
python3 - "$target" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])/'packages/worker/src/room.ts'
s=p.read_text()
needle='  async #fetchSibling(name: string, uid: string | null): Promise<string | null> {\n'
assert s.count(needle)==1, 'Upstream changed; review isolation patch'
s=s.replace(needle,needle+'''    // QMesh room IDs begin with ec_ + 32-character workbook ID. Never read across workbooks.
    if (!/^ec_[a-z0-9]{64}$/.test(name) || !this.#ownName ||
        name.slice(0, 35) !== this.#ownName.slice(0, 35)) return null;
''')
p.write_text(s)
PY
cd "$target"
bun install --frozen-lockfile
bun run --cwd packages/client build
bun run --cwd packages/client-multi build
bash scripts/build-assets.sh
bash scripts/build-workerd-bundle.sh
printf '\nPrepared pinned EtherCalc. Run with APP_ROOT, ETHERCALC_DATA_DIR, ETHERCALC_KEY and ETHERCALC_HOST=127.0.0.1.\n'
