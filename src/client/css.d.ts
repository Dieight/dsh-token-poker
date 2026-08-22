/** CSS imported as raw text (tsup `loader: { ".css": "text" }`). */
declare module "*.css" {
  const content: string;
  export default content;
}
