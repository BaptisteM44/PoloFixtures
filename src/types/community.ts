export type CommunityItemType = "idea" | "bug" | "translation";
export type CommunityStatus = "open" | "thinking" | "in_progress" | "done" | "rejected";
export type VoteType = "up" | "meh" | "down";

export interface CommunityItem {
  id: string;
  type: CommunityItemType | string;
  title: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  authorSlug: string | null;
  status: CommunityStatus | string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  up: number;
  meh: number;
  down: number;
  score: number;
  replyCount: number;
  myVote: VoteType | null;
}

export interface CommunityReply {
  id: string;
  authorId: string | null;
  authorName: string | null;
  authorSlug: string | null;
  body: string;
  isKeyReply: boolean;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
}

export interface MyVoteDetail {
  vote: VoteType;
  comment: string | null;
}

export interface CommunityItemDetail extends Omit<CommunityItem, "myVote"> {
  myVote: MyVoteDetail | null;
  replies: CommunityReply[];
}
