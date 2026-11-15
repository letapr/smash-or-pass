import { randomUUID } from "node:crypto";
import {
  BatchGetCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { CommentRecord, CommentVote } from "@/lib/comments";
import { commentsTableName, dynamo } from "@/lib/dynamodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const characterIds = new Set(["hades", "bob"]);
const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const pageSize = 100;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCharacterId(value: unknown): value is string {
  return typeof value === "string" && characterIds.has(value);
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function encodeCursor(key: Record<string, unknown> | undefined) {
  return key ? Buffer.from(JSON.stringify(key)).toString("base64url") : null;
}

function decodeCursor(cursor: string | null) {
  if (!cursor) return undefined;
  if (cursor.length > 2048) return null;

  try {
    const key: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      isObject(key) &&
      typeof key.comments === "string" &&
      typeof key.timestamp === "string" &&
      key.timestamp.startsWith("COMMENT#")
    ) {
      return { comments: key.comments, timestamp: key.timestamp };
    }
  } catch {
    return null;
  }

  return null;
}

async function parseBody(request: Request) {
  try {
    const body: unknown = await request.json();
    return isObject(body) ? body : null;
  } catch {
    return null;
  }
}

function isVote(value: unknown): value is CommentVote {
  return value === "like" || value === "dislike" || value === null;
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const characterId = search.get("characterId");
  const voterId = search.get("voterId");
  const cursor = decodeCursor(search.get("cursor"));

  if (!isCharacterId(characterId)) return jsonError("Choose a valid character.", 400);
  if (cursor === null) return jsonError("The comments cursor is invalid.", 400);
  if (cursor && cursor.comments !== characterId) {
    return jsonError("The comments cursor belongs to a different character.", 400);
  }
  if (voterId && !uuidPattern.test(voterId)) return jsonError("The guest identity is invalid.", 400);

  try {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: commentsTableName,
        KeyConditionExpression: "#partition = :characterId AND begins_with(#sort, :commentPrefix)",
        ExpressionAttributeNames: { "#partition": "comments", "#sort": "timestamp" },
        ExpressionAttributeValues: { ":characterId": characterId, ":commentPrefix": "COMMENT#" },
        ExclusiveStartKey: cursor ?? undefined,
        Limit: pageSize,
        ScanIndexForward: false,
        ConsistentRead: true,
      }),
    );

    const items = (result.Items ?? []).filter(
      (item) => item.entityType === "COMMENT" && typeof item.id === "string",
    );
    const votes = new Map<string, CommentVote>();

    if (voterId && items.length > 0) {
      let keys = items.map((item) => ({
        comments: characterId,
        timestamp: `VOTE#${String(item.id)}#${voterId}`,
      }));
      let retryCount = 0;

      while (keys.length > 0 && retryCount < 5) {
        const voteResult = await dynamo.send(
          new BatchGetCommand({
            RequestItems: {
              [commentsTableName]: {
                Keys: keys,
                ConsistentRead: true,
                ProjectionExpression: "#commentId, #vote",
                ExpressionAttributeNames: { "#commentId": "commentId", "#vote": "vote" },
              },
            },
          }),
        );

        for (const vote of voteResult.Responses?.[commentsTableName] ?? []) {
          if (
            typeof vote.commentId === "string" &&
            (vote.vote === "like" || vote.vote === "dislike")
          ) {
            votes.set(vote.commentId, vote.vote);
          }
        }

        const remaining = voteResult.UnprocessedKeys?.[commentsTableName]?.Keys ?? [];
        if (remaining.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          retryCount += 1;
        }
        keys = remaining.map((key) => ({
          comments: String(key.comments),
          timestamp: String(key.timestamp),
        }));
      }
      if (keys.length > 0) {
        throw new Error("DynamoDB did not process all comment vote lookups.");
      }
    }

    const comments: CommentRecord[] = items.map((item) => ({
      id: String(item.id),
      timestamp: String(item.timestamp),
      characterId,
      parentId: typeof item.parentId === "string" ? item.parentId : null,
      username: String(item.username ?? "Guest"),
      userId: String(item.userId ?? ""),
      text: String(item.text ?? ""),
      createdAt: String(item.createdAt ?? ""),
      likes: typeof item.likes === "number" ? item.likes : 0,
      dislikes: typeof item.dislikes === "number" ? item.dislikes : 0,
      myVote: votes.get(String(item.id)) ?? null,
    }));

    return Response.json(
      { comments, nextCursor: encodeCursor(result.LastEvaluatedKey) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load comments from DynamoDB.", error);
    return jsonError("Comments could not be loaded. Check the DynamoDB table and Amplify role permissions.", 500);
  }
}

export async function POST(request: Request) {
  const body = await parseBody(request);
  if (!body) return jsonError("A valid JSON request is required.", 400);

  const { characterId, username, userId, text, parentId, parentTimestamp } = body;
  if (!isCharacterId(characterId)) return jsonError("Choose a valid character.", 400);
  if (typeof userId !== "string" || !uuidPattern.test(userId)) {
    return jsonError("The guest identity is invalid. Refresh the page and try again.", 400);
  }
  if (typeof username !== "string" || username.trim().length < 1 || username.trim().length > 24) {
    return jsonError("Display names must be between 1 and 24 characters.", 400);
  }
  if (typeof text !== "string" || text.trim().length < 1 || text.trim().length > 1000) {
    return jsonError("Comments must be between 1 and 1,000 characters.", 400);
  }
  if (
    parentId !== null &&
    (typeof parentId !== "string" ||
      !uuidPattern.test(parentId) ||
      typeof parentTimestamp !== "string" ||
      !parentTimestamp.startsWith("COMMENT#") ||
      parentTimestamp.length > 128)
  ) {
    return jsonError("The reply's parent comment is invalid.", 400);
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const timestamp = `COMMENT#${createdAt}#${id}`;
  const comment: CommentRecord = {
    id,
    timestamp,
    characterId,
    parentId: typeof parentId === "string" ? parentId : null,
    username: username.trim(),
    userId,
    text: text.trim(),
    createdAt,
    likes: 0,
    dislikes: 0,
    myVote: null,
  };

  try {
    if (comment.parentId && typeof parentTimestamp === "string") {
      const parent = await dynamo.send(
        new GetCommand({
          TableName: commentsTableName,
          Key: { comments: characterId, timestamp: parentTimestamp },
          ConsistentRead: true,
        }),
      );
      if (parent.Item?.entityType !== "COMMENT" || parent.Item.id !== comment.parentId) {
        return jsonError("The parent comment was not found for this character.", 404);
      }
    }

    await dynamo.send(
      new PutCommand({
        TableName: commentsTableName,
        Item: {
          comments: characterId,
          timestamp,
          entityType: "COMMENT",
          id,
          parentId: comment.parentId ?? undefined,
          username: comment.username,
          userId,
          text: comment.text,
          createdAt,
          likes: 0,
          dislikes: 0,
        },
        ConditionExpression: "attribute_not_exists(#partition) AND attribute_not_exists(#sort)",
        ExpressionAttributeNames: { "#partition": "comments", "#sort": "timestamp" },
      }),
    );

    return Response.json({ comment }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to create a comment in DynamoDB.", error);
    return jsonError("Your comment could not be saved. Check the DynamoDB table and Amplify role permissions.", 500);
  }
}

export async function PUT(request: Request) {
  const body = await parseBody(request);
  if (!body) return jsonError("A valid JSON request is required.", 400);

  const { characterId, commentId, commentTimestamp, voterId, vote } = body;
  if (
    !isCharacterId(characterId) ||
    typeof commentId !== "string" ||
    !uuidPattern.test(commentId) ||
    typeof commentTimestamp !== "string" ||
    !commentTimestamp.startsWith("COMMENT#") ||
    typeof voterId !== "string" ||
    !uuidPattern.test(voterId) ||
    !isVote(vote)
  ) {
    return jsonError("The vote request is invalid.", 400);
  }

  const commentKey = { comments: characterId, timestamp: commentTimestamp };
  const voteKey = { comments: characterId, timestamp: `VOTE#${commentId}#${voterId}` };

  try {
    const [commentResult, voteResult] = await Promise.all([
      dynamo.send(
        new GetCommand({
          TableName: commentsTableName,
          Key: commentKey,
          ConsistentRead: true,
        }),
      ),
      dynamo.send(
        new GetCommand({
          TableName: commentsTableName,
          Key: voteKey,
          ConsistentRead: true,
        }),
      ),
    ]);

    const currentComment = commentResult.Item;
    if (currentComment?.entityType !== "COMMENT" || currentComment.id !== commentId) {
      return jsonError("The comment was not found.", 404);
    }
    const previousVote =
      voteResult.Item?.vote === "like" || voteResult.Item?.vote === "dislike"
        ? voteResult.Item.vote
        : null;
    const nextVote = vote as CommentVote;

    if (previousVote !== nextVote) {
      const likeDelta = Number(nextVote === "like") - Number(previousVote === "like");
      const dislikeDelta = Number(nextVote === "dislike") - Number(previousVote === "dislike");
      const transactionItems: NonNullable<TransactWriteCommandInput["TransactItems"]> = [
        {
          Update: {
            TableName: commentsTableName,
            Key: commentKey,
            UpdateExpression:
              "SET #likes = if_not_exists(#likes, :zero) + :likeDelta, #dislikes = if_not_exists(#dislikes, :zero) + :dislikeDelta",
            ConditionExpression: "attribute_exists(#partition) AND #entityType = :comment",
            ExpressionAttributeNames: {
              "#partition": "comments",
              "#entityType": "entityType",
              "#likes": "likes",
              "#dislikes": "dislikes",
            },
            ExpressionAttributeValues: {
              ":zero": 0,
              ":likeDelta": likeDelta,
              ":dislikeDelta": dislikeDelta,
              ":comment": "COMMENT",
            },
          },
        },
      ];

      if (nextVote === null && previousVote !== null) {
        transactionItems.push({
          Delete: {
            TableName: commentsTableName,
            Key: voteKey,
            ConditionExpression: "#vote = :previousVote",
            ExpressionAttributeNames: { "#vote": "vote" },
            ExpressionAttributeValues: { ":previousVote": previousVote },
          },
        });
      } else if (previousVote === null && nextVote !== null) {
        transactionItems.push({
          Put: {
            TableName: commentsTableName,
            Item: {
              ...voteKey,
              entityType: "VOTE",
              commentId,
              voterId,
              vote: nextVote,
              updatedAt: new Date().toISOString(),
            },
            ConditionExpression: "attribute_not_exists(#partition) AND attribute_not_exists(#sort)",
            ExpressionAttributeNames: { "#partition": "comments", "#sort": "timestamp" },
          },
        });
      } else if (previousVote !== null && nextVote !== null) {
        transactionItems.push({
          Update: {
            TableName: commentsTableName,
            Key: voteKey,
            UpdateExpression: "SET #vote = :nextVote, #updatedAt = :updatedAt",
            ConditionExpression: "#vote = :previousVote",
            ExpressionAttributeNames: { "#vote": "vote", "#updatedAt": "updatedAt" },
            ExpressionAttributeValues: {
              ":previousVote": previousVote,
              ":nextVote": nextVote,
              ":updatedAt": new Date().toISOString(),
            },
          },
        });
      }

      await dynamo.send(new TransactWriteCommand({ TransactItems: transactionItems }));
    }

    const updated = await dynamo.send(
      new GetCommand({
        TableName: commentsTableName,
        Key: commentKey,
        ConsistentRead: true,
      }),
    );

    return Response.json(
      {
        likes: typeof updated.Item?.likes === "number" ? updated.Item.likes : 0,
        dislikes: typeof updated.Item?.dislikes === "number" ? updated.Item.dislikes : 0,
        myVote: nextVote,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TransactionCanceledException") {
      return jsonError("Your vote changed at the same time. Refresh the comments and try again.", 409);
    }
    console.error("Failed to update a comment vote in DynamoDB.", error);
    return jsonError("Your vote could not be saved. Check the DynamoDB table and Amplify role permissions.", 500);
  }
}
