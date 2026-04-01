import { z } from "zod";

const nicknameRegex = /^[a-zA-Z0-9 _-]{2,18}$/;
const roomCodeRegex = /^[A-Z2-9]{6}$/;

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, "Nickname must be at least 2 characters.")
  .max(18, "Nickname must be 18 characters or fewer.")
  .regex(nicknameRegex, "Nickname can only use letters, numbers, spaces, hyphens, and underscores.");

export const roomCodeSchema = z.string().trim().toUpperCase().regex(roomCodeRegex, "Room codes are six letters or digits.");

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
});

export const sessionSchema = z.object({
  nickname: nicknameSchema,
});

export const joinRoomSchema = z.object({
  nickname: nicknameSchema,
});

export const readySchema = z.object({
  ready: z.boolean(),
});

export const moveSchema = z.object({
  x: z.number().int().min(0).max(14),
  y: z.number().int().min(0).max(14),
});
