export type CommentVote = "like" | "dislike" | null;

export type CommentRecord = {
  id: string;
  timestamp: string;
  characterId: string;
  parentId: string | null;
  username: string;
  userId: string;
  text: string;
  createdAt: string;
  likes: number;
  dislikes: number;
  myVote: CommentVote;
};

export type GuestIdentity = {
  userId: string;
  username: string;
};

export type CommentPage = {
  comments: CommentRecord[];
  nextCursor: string | null;
};
