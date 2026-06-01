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

export const articles: Article[] = [
  lonelyAtNight,
  noOneToTalkTo,
  noOneUnderstandsGrief,
  leftBehindByFriends,
  anxietyAt3am,
  imNotOkay,
];
