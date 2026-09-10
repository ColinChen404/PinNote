# 从 vision/软件iconV2.png 生成打包图标：
#   build-res/icon.ico : 多尺寸（16~256，Windows ico 最大标准尺寸 256）
#   build-res/icon.png : 512px（顶栏/README/electron-builder 用）
# 旧图标会先备份到 vision/old-icon.png / old-icon.ico
import os, shutil
from PIL import Image

root = r'E:\PinNote 项目文件'
src = os.path.join(root, 'vision', '软件iconV2.png')
br = os.path.join(root, 'build-res')

for f in ('icon.png', 'icon.ico'):
    p = os.path.join(br, f)
    if os.path.exists(p):
        shutil.copy2(p, os.path.join(root, 'vision', 'old-' + f))

img = Image.open(src).convert('RGBA')
print('source size:', img.size)

img.save(os.path.join(br, 'icon.ico'),
         sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
img.resize((512, 512), Image.LANCZOS).save(os.path.join(br, 'icon.png'))
print('done: icon.ico (16-256) + icon.png (512)')
