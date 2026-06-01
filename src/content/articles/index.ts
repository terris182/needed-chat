import type { Article } from "@/lib/blog";

// Registry of all published articles.
// To add an article: create a new file in this folder exporting `article`,
// then import it here and add it to the array below.
import { article as lonelyAtNight } from "./lonely-at-night";
import { article as noOneToTalkTo } from "./no-one-to-talk-to";
import { article as noOneUnderstandsGrief } from "./no-one-understands-grief";
import { article as leftBehindByFriends } from "./left-behind-by-friends";
import { article as anxietyAt3am } from "./anxiety-at-3am";
import { article as imNotOkay } from "./im-not-okay";
import { article as lonelyInACrowd } from "./lonely-in-a-crowd";
import { article as grievingWhileFunctioning } from "./grieving-while-functioning";
import { article as cantStopOverthinking } from "./cant-stop-overthinking";
import { article as everythingTooMuch } from "./everything-too-much";
import { article as growingApartFromFriends } from "./growing-apart-from-friends";
import { article as feelingNumb } from "./feeling-numb";
import { article as unseenInRelationship } from "./unseen-in-relationship";
import { article as talkToSomeoneAt2am } from "./talk-to-someone-at-2am";
import { article as worldCup2026 } from "./world-cup-2026-where-to-argue";
import { article as needToTalkDontKnowWho } from "./need-to-talk-dont-know-who";

export const articles: Article[] = [
  lonelyAtNight,
  noOneToTalkTo,
  noOneUnderstandsGrief,
  leftBehindByFriends,
  anxietyAt3am,
  imNotOkay,
  lonelyInACrowd,
  grievingWhileFunctioning,
  cantStopOverthinking,
  everythingTooMuch,
  growingApartFromFriends,
  feelingNumb,
  unseenInRelationship,
  talkToSomeoneAt2am,
  worldCup2026,
  needToTalkDontKnowWho,
];
