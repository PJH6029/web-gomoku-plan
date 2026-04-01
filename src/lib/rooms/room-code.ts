import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@/lib/rooms/constants";

export function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase();
}

export function generateRoomCode() {
  let code = "";

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[randomIndex];
  }

  return code;
}
