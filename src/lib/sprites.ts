import type { CSSProperties } from 'react'
import '../SpriteArt.css'

type SpriteBounds = readonly [left: number, top: number, right: number, bottom: number]

// 시트의 균등 칸 대신 실제 그림의 투명도 경계를 기준으로 중심과 크기를 맞춥니다.
export const spriteBounds = {
  pickaxes: [
    [53, 35, 283, 279], [356, 36, 586, 279], [661, 36, 888, 279], [967, 35, 1196, 283],
    [41, 340, 275, 595], [348, 341, 582, 597], [652, 341, 887, 596], [960, 340, 1195, 597],
    [38, 649, 271, 903], [346, 647, 583, 905], [649, 646, 884, 906], [956, 646, 1192, 905],
    [32, 953, 269, 1214], [341, 952, 579, 1214], [647, 952, 884, 1214], [955, 951, 1191, 1214],
  ],
  ores: [
    [128, 31, 286, 168], [463, 29, 622, 170], [795, 30, 956, 170], [1130, 30, 1290, 170],
    [127, 220, 287, 360], [461, 220, 622, 359], [801, 228, 949, 351], [1138, 221, 1282, 357],
    [148, 410, 260, 550], [467, 401, 609, 559], [824, 410, 926, 550], [1162, 410, 1273, 550],
    [128, 602, 280, 732], [461, 606, 616, 739], [793, 605, 958, 739], [1143, 588, 1291, 749],
  ],
  monsters: [
    [109, 111, 382, 365], [415, 134, 818, 399], [877, 147, 1156, 371],
    [74, 514, 373, 739], [429, 512, 813, 734], [836, 438, 1182, 759],
    [78, 815, 342, 1140], [399, 801, 705, 1141], [789, 802, 1182, 1157],
  ],
  monsterItems: [[189, 143, 537, 501], [705, 142, 1045, 515], [174, 690, 542, 1082], [695, 715, 1054, 1077]],
  chests: [[93, 103, 560, 562], [682, 119, 1148, 572], [98, 645, 561, 1116], [669, 641, 1153, 1132]],
  openChests: [[120, 53, 594, 574], [680, 59, 1152, 576], [116, 612, 606, 1167], [663, 611, 1155, 1177]],
} as const satisfies Record<string, readonly SpriteBounds[]>

export function atlasSpriteStyle(url: string, width: number, height: number, bounds: SpriteBounds): CSSProperties {
  const [left, top, right, bottom] = bounds
  const spriteWidth = right - left
  const spriteHeight = bottom - top
  const frame = Math.max(spriteWidth, spriteHeight) * 1.06
  return {
    width: `${(spriteWidth / frame) * 100}%`,
    height: `${(spriteHeight / frame) * 100}%`,
    backgroundImage: `url(${url})`,
    backgroundSize: `${(width / spriteWidth) * 100}% ${(height / spriteHeight) * 100}%`,
    backgroundPosition: `${(left / (width - spriteWidth)) * 100}% ${(top / (height - spriteHeight)) * 100}%`,
  }
}
