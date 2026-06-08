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
import { article as swiftWeddingBear } from "./swift-wedding-bear-everything";
import { article as prideMonthConversations } from "./pride-month-conversations";
import { article as worldCupPredictionsWrong } from "./world-cup-predictions-wrong";
import { article as burnoutSummer } from "./burnout-doesnt-take-summer-off";
import { article as avatarSummerShows } from "./avatar-is-back-summer-shows";
import { article as notOnlyOneAwake } from "./not-only-one-awake-3am";
import { article as wakingUp3amAnxiety } from "./waking-up-3am-anxiety";
import { article as lonelyNewCity } from "./lonely-new-city";
import { article as exhaustedCantRest } from "./exhausted-cant-rest";
import { article as anonymousSomeoneToTalkTo } from "./anonymous-someone-to-talk-to";

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
  swiftWeddingBear,
  prideMonthConversations,
  worldCupPredictionsWrong,
  burnoutSummer,
  avatarSummerShows,
  notOnlyOneAwake,
  wakingUp3amAnxiety,
  lonelyNewCity,
  exhaustedCantRest,
  anonymousSomeoneToTalkTo,
];
