#!/bin/sh
# Rocketbox 人物一条龙：Blender 重定向 → 收尾（贴图缩小、睫毛镂空）→ meshopt 压缩
#   sh tools/build_rocketbox.sh <Rocketbox 名字> <输出名> [动作来源 glb，默认 player_m]
set -e
cd "$(dirname "$0")/.."
NAME=$1; OUT=$2; SRC=${3:-player_m}
RB="$LOCALAPPDATA/myWorld-R3/rocketbox"; mkdir -p "$RB"
BLENDER="/c/Users/yuanc/AppData/Local/Programs/Blender Foundation/blender-5.3.0-windows-x64/blender.exe"
node tools/decompress_glb.mjs "game/assets/characters/$SRC.glb" "$RB/motion_$SRC.glb" < /dev/null
"$BLENDER" -b --disable-autoexec --python-exit-code 1 --python tools/blender/build_rocketbox.py -- "$NAME" "$RB/motion_$SRC.glb" "$RB/$OUT.glb" > "$RB/$OUT.log" 2>&1 || { tail -30 "$RB/$OUT.log" >&2; exit 1; }
grep -E "^FACE|^HIP|^DONE" "$RB/$OUT.log"
node tools/rocketbox_finish.mjs "$RB/$OUT.glb" "$RB/${OUT}_f.glb" < /dev/null > /dev/null
if [ "$NAME" = "Female_Adult_14" ]; then
  set -- 78 78  # 她的身体法线纹理较大；保留 1024 分辨率和头发的独立 alpha。
else
  set --
fi
node tools/compress_glb.mjs "$RB/${OUT}_f.glb" "game/assets/characters/$OUT.glb" "$@" < /dev/null
