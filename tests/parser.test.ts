import { expect } from "chai";
import { ParseError, ParseErrors, Parsers, Success } from "../index";

context('primitives', () => {
    it('parses null', () => {
        expect(Parsers.asNull.parse(undefined)).deep.equal(new ParseErrors([
            new ParseError(
                [],
                "expected null but got undefined",
            )
        ]));

        expect(Parsers.asNull.parse(null)).deep.equal(new Success(null));
    });

    it('parses undefined', () => {
        expect(Parsers.asUndefined.parse(null)).deep.equal(new ParseErrors([
            new ParseError(
                [],
                "expected undefined but got object",
            )
        ]));

        expect(Parsers.asUndefined.parse(undefined)).deep.equal(new Success(undefined));
    });

    it('parses number', () => {
        expect(Parsers.asNumber.parse(null)).deep.equal(new ParseErrors([
            new ParseError(
                [],
                "expected number but got object",
            )
        ]));

        expect(Parsers.asNumber.parse(42)).deep.equal(new Success(42));
    });
});
