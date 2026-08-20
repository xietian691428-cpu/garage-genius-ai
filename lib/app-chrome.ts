/**
 * App chrome breakpoint (Tailwind `xl` = 1280px).
 *
 * iPad Air 11 landscape is ~1180 CSS pixels — that used to hit `lg` (1024)
 * and paint the desktop sidebar + vehicle column, which misaligns Chat.
 * Keep tablet / phone chrome (tabs + stacked chat) below 1280.
 */
export const APP_DESKTOP_MIN_PX = 1280;
