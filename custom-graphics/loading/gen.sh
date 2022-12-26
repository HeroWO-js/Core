# Don't trim whitespace around images because animation frames must have the
# same size and static GIF must have the same size as animation.
#find -name \*Owner-7-0.png | xargs -I% convert % -trim %.trim.png

# 1. Create static GIF (32 BPP) from AH??_E/*Owner-0-0.png or AH??_/*Owner-7-0.

# 2. Generate APNG. The following works on Windows too.

apngasm -z2 AH00_-blueOwner.png AH00_/blueOwner-7-*.png
apngasm -z2 AH00_-greenOwner.png AH00_/greenOwner-7-*.png
apngasm -z2 AH00_-orangeOwner.png AH00_/orangeOwner-7-*.png
apngasm -z2 AH00_-pinkOwner.png AH00_/pinkOwner-7-*.png
apngasm -z2 AH00_-purpleOwner.png AH00_/purpleOwner-7-*.png
apngasm -z2 AH00_-redOwner.png AH00_/redOwner-7-*.png
apngasm -z2 AH00_-tanOwner.png AH00_/tanOwner-7-*.png
apngasm -z2 AH00_-tealOwner.png AH00_/tealOwner-7-*.png

apngasm -z2 AH01_-blueOwner.png AH01_/blueOwner-7-*.png
apngasm -z2 AH01_-greenOwner.png AH01_/greenOwner-7-*.png
apngasm -z2 AH01_-orangeOwner.png AH01_/orangeOwner-7-*.png
apngasm -z2 AH01_-pinkOwner.png AH01_/pinkOwner-7-*.png
apngasm -z2 AH01_-purpleOwner.png AH01_/purpleOwner-7-*.png
apngasm -z2 AH01_-redOwner.png AH01_/redOwner-7-*.png
apngasm -z2 AH01_-tanOwner.png AH01_/tanOwner-7-*.png
apngasm -z2 AH01_-tealOwner.png AH01_/tealOwner-7-*.png

apngasm -z2 AH02_-blueOwner.png AH02_/blueOwner-7-*.png
apngasm -z2 AH02_-greenOwner.png AH02_/greenOwner-7-*.png
apngasm -z2 AH02_-orangeOwner.png AH02_/orangeOwner-7-*.png
apngasm -z2 AH02_-pinkOwner.png AH02_/pinkOwner-7-*.png
apngasm -z2 AH02_-purpleOwner.png AH02_/purpleOwner-7-*.png
apngasm -z2 AH02_-redOwner.png AH02_/redOwner-7-*.png
apngasm -z2 AH02_-tanOwner.png AH02_/tanOwner-7-*.png
apngasm -z2 AH02_-tealOwner.png AH02_/tealOwner-7-*.png

apngasm -z2 AH03_-blueOwner.png AH03_/blueOwner-7-*.png
apngasm -z2 AH03_-greenOwner.png AH03_/greenOwner-7-*.png
apngasm -z2 AH03_-orangeOwner.png AH03_/orangeOwner-7-*.png
apngasm -z2 AH03_-pinkOwner.png AH03_/pinkOwner-7-*.png
apngasm -z2 AH03_-purpleOwner.png AH03_/purpleOwner-7-*.png
apngasm -z2 AH03_-redOwner.png AH03_/redOwner-7-*.png
apngasm -z2 AH03_-tanOwner.png AH03_/tanOwner-7-*.png
apngasm -z2 AH03_-tealOwner.png AH03_/tealOwner-7-*.png

apngasm -z2 AH04_-blueOwner.png AH04_/blueOwner-7-*.png
apngasm -z2 AH04_-greenOwner.png AH04_/greenOwner-7-*.png
apngasm -z2 AH04_-orangeOwner.png AH04_/orangeOwner-7-*.png
apngasm -z2 AH04_-pinkOwner.png AH04_/pinkOwner-7-*.png
apngasm -z2 AH04_-purpleOwner.png AH04_/purpleOwner-7-*.png
apngasm -z2 AH04_-redOwner.png AH04_/redOwner-7-*.png
apngasm -z2 AH04_-tanOwner.png AH04_/tanOwner-7-*.png
apngasm -z2 AH04_-tealOwner.png AH04_/tealOwner-7-*.png

apngasm -z2 AH05_-blueOwner.png AH05_/blueOwner-7-*.png
apngasm -z2 AH05_-greenOwner.png AH05_/greenOwner-7-*.png
apngasm -z2 AH05_-orangeOwner.png AH05_/orangeOwner-7-*.png
apngasm -z2 AH05_-pinkOwner.png AH05_/pinkOwner-7-*.png
apngasm -z2 AH05_-purpleOwner.png AH05_/purpleOwner-7-*.png
apngasm -z2 AH05_-redOwner.png AH05_/redOwner-7-*.png
apngasm -z2 AH05_-tanOwner.png AH05_/tanOwner-7-*.png
apngasm -z2 AH05_-tealOwner.png AH05_/tealOwner-7-*.png

apngasm -z2 AH06_-blueOwner.png AH06_/blueOwner-7-*.png
apngasm -z2 AH06_-greenOwner.png AH06_/greenOwner-7-*.png
apngasm -z2 AH06_-orangeOwner.png AH06_/orangeOwner-7-*.png
apngasm -z2 AH06_-pinkOwner.png AH06_/pinkOwner-7-*.png
apngasm -z2 AH06_-purpleOwner.png AH06_/purpleOwner-7-*.png
apngasm -z2 AH06_-redOwner.png AH06_/redOwner-7-*.png
apngasm -z2 AH06_-tanOwner.png AH06_/tanOwner-7-*.png
apngasm -z2 AH06_-tealOwner.png AH06_/tealOwner-7-*.png

apngasm -z2 AH07_-blueOwner.png AH07_/blueOwner-7-*.png
apngasm -z2 AH07_-greenOwner.png AH07_/greenOwner-7-*.png
apngasm -z2 AH07_-orangeOwner.png AH07_/orangeOwner-7-*.png
apngasm -z2 AH07_-pinkOwner.png AH07_/pinkOwner-7-*.png
apngasm -z2 AH07_-purpleOwner.png AH07_/purpleOwner-7-*.png
apngasm -z2 AH07_-redOwner.png AH07_/redOwner-7-*.png
apngasm -z2 AH07_-tanOwner.png AH07_/tanOwner-7-*.png
apngasm -z2 AH07_-tealOwner.png AH07_/tealOwner-7-*.png

apngasm -z2 AH08_-blueOwner.png AH08_/blueOwner-7-*.png
apngasm -z2 AH08_-greenOwner.png AH08_/greenOwner-7-*.png
apngasm -z2 AH08_-orangeOwner.png AH08_/orangeOwner-7-*.png
apngasm -z2 AH08_-pinkOwner.png AH08_/pinkOwner-7-*.png
apngasm -z2 AH08_-purpleOwner.png AH08_/purpleOwner-7-*.png
apngasm -z2 AH08_-redOwner.png AH08_/redOwner-7-*.png
apngasm -z2 AH08_-tanOwner.png AH08_/tanOwner-7-*.png
apngasm -z2 AH08_-tealOwner.png AH08_/tealOwner-7-*.png

apngasm -z2 AH09_-blueOwner.png AH09_/blueOwner-7-*.png
apngasm -z2 AH09_-greenOwner.png AH09_/greenOwner-7-*.png
apngasm -z2 AH09_-orangeOwner.png AH09_/orangeOwner-7-*.png
apngasm -z2 AH09_-pinkOwner.png AH09_/pinkOwner-7-*.png
apngasm -z2 AH09_-purpleOwner.png AH09_/purpleOwner-7-*.png
apngasm -z2 AH09_-redOwner.png AH09_/redOwner-7-*.png
apngasm -z2 AH09_-tanOwner.png AH09_/tanOwner-7-*.png
apngasm -z2 AH09_-tealOwner.png AH09_/tealOwner-7-*.png

apngasm -z2 AH10_-blueOwner.png AH10_/blueOwner-7-*.png
apngasm -z2 AH10_-greenOwner.png AH10_/greenOwner-7-*.png
apngasm -z2 AH10_-orangeOwner.png AH10_/orangeOwner-7-*.png
apngasm -z2 AH10_-pinkOwner.png AH10_/pinkOwner-7-*.png
apngasm -z2 AH10_-purpleOwner.png AH10_/purpleOwner-7-*.png
apngasm -z2 AH10_-redOwner.png AH10_/redOwner-7-*.png
apngasm -z2 AH10_-tanOwner.png AH10_/tanOwner-7-*.png
apngasm -z2 AH10_-tealOwner.png AH10_/tealOwner-7-*.png

apngasm -z2 AH11_-blueOwner.png AH11_/blueOwner-7-*.png
apngasm -z2 AH11_-greenOwner.png AH11_/greenOwner-7-*.png
apngasm -z2 AH11_-orangeOwner.png AH11_/orangeOwner-7-*.png
apngasm -z2 AH11_-pinkOwner.png AH11_/pinkOwner-7-*.png
apngasm -z2 AH11_-purpleOwner.png AH11_/purpleOwner-7-*.png
apngasm -z2 AH11_-redOwner.png AH11_/redOwner-7-*.png
apngasm -z2 AH11_-tanOwner.png AH11_/tanOwner-7-*.png
apngasm -z2 AH11_-tealOwner.png AH11_/tealOwner-7-*.png

apngasm -z2 AH12_-blueOwner.png AH12_/blueOwner-7-*.png
apngasm -z2 AH12_-greenOwner.png AH12_/greenOwner-7-*.png
apngasm -z2 AH12_-orangeOwner.png AH12_/orangeOwner-7-*.png
apngasm -z2 AH12_-pinkOwner.png AH12_/pinkOwner-7-*.png
apngasm -z2 AH12_-purpleOwner.png AH12_/purpleOwner-7-*.png
apngasm -z2 AH12_-redOwner.png AH12_/redOwner-7-*.png
apngasm -z2 AH12_-tanOwner.png AH12_/tanOwner-7-*.png
apngasm -z2 AH12_-tealOwner.png AH12_/tealOwner-7-*.png

apngasm -z2 AH13_-blueOwner.png AH13_/blueOwner-7-*.png
apngasm -z2 AH13_-greenOwner.png AH13_/greenOwner-7-*.png
apngasm -z2 AH13_-orangeOwner.png AH13_/orangeOwner-7-*.png
apngasm -z2 AH13_-pinkOwner.png AH13_/pinkOwner-7-*.png
apngasm -z2 AH13_-purpleOwner.png AH13_/purpleOwner-7-*.png
apngasm -z2 AH13_-redOwner.png AH13_/redOwner-7-*.png
apngasm -z2 AH13_-tanOwner.png AH13_/tanOwner-7-*.png
apngasm -z2 AH13_-tealOwner.png AH13_/tealOwner-7-*.png

apngasm -z2 AH14_-blueOwner.png AH14_/blueOwner-7-*.png
apngasm -z2 AH14_-greenOwner.png AH14_/greenOwner-7-*.png
apngasm -z2 AH14_-orangeOwner.png AH14_/orangeOwner-7-*.png
apngasm -z2 AH14_-pinkOwner.png AH14_/pinkOwner-7-*.png
apngasm -z2 AH14_-purpleOwner.png AH14_/purpleOwner-7-*.png
apngasm -z2 AH14_-redOwner.png AH14_/redOwner-7-*.png
apngasm -z2 AH14_-tanOwner.png AH14_/tanOwner-7-*.png
apngasm -z2 AH14_-tealOwner.png AH14_/tealOwner-7-*.png

apngasm -z2 AH15_-blueOwner.png AH15_/blueOwner-7-*.png
apngasm -z2 AH15_-greenOwner.png AH15_/greenOwner-7-*.png
apngasm -z2 AH15_-orangeOwner.png AH15_/orangeOwner-7-*.png
apngasm -z2 AH15_-pinkOwner.png AH15_/pinkOwner-7-*.png
apngasm -z2 AH15_-purpleOwner.png AH15_/purpleOwner-7-*.png
apngasm -z2 AH15_-redOwner.png AH15_/redOwner-7-*.png
apngasm -z2 AH15_-tanOwner.png AH15_/tanOwner-7-*.png
apngasm -z2 AH15_-tealOwner.png AH15_/tealOwner-7-*.png

apngasm -z2 AH16_-blueOwner.png AH16_/blueOwner-7-*.png
apngasm -z2 AH16_-greenOwner.png AH16_/greenOwner-7-*.png
apngasm -z2 AH16_-orangeOwner.png AH16_/orangeOwner-7-*.png
apngasm -z2 AH16_-pinkOwner.png AH16_/pinkOwner-7-*.png
apngasm -z2 AH16_-purpleOwner.png AH16_/purpleOwner-7-*.png
apngasm -z2 AH16_-redOwner.png AH16_/redOwner-7-*.png
apngasm -z2 AH16_-tanOwner.png AH16_/tanOwner-7-*.png
apngasm -z2 AH16_-tealOwner.png AH16_/tealOwner-7-*.png

apngasm -z2 AH17_-blueOwner.png AH17_/blueOwner-7-*.png
apngasm -z2 AH17_-greenOwner.png AH17_/greenOwner-7-*.png
apngasm -z2 AH17_-orangeOwner.png AH17_/orangeOwner-7-*.png
apngasm -z2 AH17_-pinkOwner.png AH17_/pinkOwner-7-*.png
apngasm -z2 AH17_-purpleOwner.png AH17_/purpleOwner-7-*.png
apngasm -z2 AH17_-redOwner.png AH17_/redOwner-7-*.png
apngasm -z2 AH17_-tanOwner.png AH17_/tanOwner-7-*.png
apngasm -z2 AH17_-tealOwner.png AH17_/tealOwner-7-*.png
