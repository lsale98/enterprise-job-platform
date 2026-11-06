export class InvalidMembershipCursorError extends Error {
  constructor() {
    super("Invalid membership cursor");

    this.name = "InvalidMembershipCursorError";
  }
}
