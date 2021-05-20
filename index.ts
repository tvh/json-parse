export class Success<A> {
    constructor(readonly value: A) {}
}

export class ParseErrors {
    constructor(readonly errors: ParseError[]) {}

    prependPath(pathElement: PathElement): ParseErrors {
        return new ParseErrors(this.errors.map(x => x.prependPath(pathElement)));
    }
}

export class ParseError {
    constructor(
        readonly path: Path,
        readonly error: string | ParseErrorAlternatives,
    ) {}

    prependPath(pathElement: PathElement): ParseError {
        return new ParseError(
            [
                pathElement,
                ...this.path
            ],
            this.error,
        );
    }
}

export class ParseErrorAlternatives {
    constructor(readonly errors: readonly ParseErrors[]) {}
}

export type PathElement = number | string;
export type Path = readonly PathElement[];

export type ParseResult<O> = Success<O> | ParseErrors;

export abstract class Parser<Output, Input=unknown> {
    abstract parse(input: Input): ParseResult<Output>;

    bind<O2>(p2: Parser<O2, Output>): Parser<O2, Input> {
        return new Bind(this, p2);
    }

    custom<O2>(f: (x:Output) => ParseResult<O2>): Parser<O2, Input> {
        return this.bind(new CustomParser(f))
    }

    get asNull(): Parser<null, Input> { return this.bind(Parsers.asNull) }
    get asUndefined(): Parser<undefined, Input> { return this.bind(Parsers.asUndefined) }
    get asNumber(): Parser<number, Input> { return this.bind(Parsers.asNumber) }
    get asString(): Parser<string, Input> { return this.bind(Parsers.asString) }
    get asArray(): Parser<readonly unknown[], Input> { return this.bind(Parsers.asArray) }
    get asObject(): Parser<Object, Input> { return this.bind(Parsers.asObject) }
    get asFunction(): Parser<Function, Input> { return this.bind(Parsers.asFunction) }

    parseArray<Output>(p: Parser<Output>): Parser<Output[]> {return this.bind(Parsers.parseArray(p)) }
}

class CustomParser<Output, Input> extends Parser<Output, Input> {
    constructor(readonly parse: (x:Input) => ParseResult<Output>) {
        super();
    }
}

class Bind<Output, Input, Intermediate> extends Parser<Output, Input> {
    constructor(
        readonly p1: Parser<Intermediate, Input>,
        readonly p2: Parser<Output, Intermediate>,
    ) {
        super();
    }

    parse(input: Input): ParseErrors | Success<Output> {
        const x = this.p1.parse(input);
        if (x instanceof ParseErrors) {
            return x;
        } else {
            return this.p2.parse(x.value);
        }
    }
}

class Map<Output, Input> extends Parser<Output[], readonly Input[]> {
    constructor(
        readonly p: Parser<Output, Input>,
    ) {
        super();
    }

    parse(inputs: readonly Input[]): ParseErrors | Success<Output[]> {
        const errors: ParseError[] = [];
        const results: Output[] = [];

        inputs.forEach((input, i) => {
            const res = this.p.parse(input);
            if (res instanceof ParseErrors) {
                errors.push(...res.prependPath(i).errors);
            } else {
                results.push(res.value);
            }
        });

        if (errors.length !== 0) {
            return new ParseErrors(errors);
        } else {
            return new Success(results);
        }
    }
}

class ParseAt<Output> extends Parser<Output, AnyObject> {
    constructor(readonly key: string, readonly p: Parser<Output>) {
        super();
    }

    parse(input: AnyObject): ParseResult<Output> {
        const x = input[this.key];
        const res = this.p.parse(x);
        if (res instanceof Success) {
            return res;
        } else {
            return res
        }
    }
}

class DictParser<Res extends {[k: string]: unknown}> extends Parser<Res, AnyObject> {
    constructor(readonly parserDict: { readonly [k in keyof Res]: Parser<Res[k]> }) {
        super();
    }

    parse(input: AnyObject): ParseResult<Res> {
        const errors: ParseError[] = [];
        const res: Partial<Res> = {};

        Object.keys(this.parserDict).forEach((k) => {
            const p = this.parserDict[k];
            const x = p.parse(input);
            if (x instanceof ParseErrors) {
                errors.push(...x.prependPath(k).errors);
            } else {
                res[k as keyof Res] = x.value;
            }
        });

        if (errors.length !== 0) {
            return new ParseErrors(errors);
        } else {
            return new Success(res as Res);
        }
    }
}

/// Like DictParser but parses the parsers at exactly the keys that are supplied
export class SimpleDictParser<Res extends  {[k: string]: unknown}> extends DictParser<Res> {
    private static transformParserDict<Res extends AnyObject>(
        parserDict: { readonly [k in keyof Res]: Parser<Res[k]> },
    ) {
        const res: Partial<{ readonly [k in keyof Res]: Parser<Res[k]> }> = {};
        Object.keys(parserDict).forEach((k) => {
            const sourceP = parserDict[k];
            res[k as keyof Res] = new ParseAt(k, sourceP);
        })
        return res as { readonly [k in keyof Res]: Parser<Res[k]> };
    }

    constructor(readonly parserDict: { readonly [k in keyof Res]: Parser<Res[k]> }) {
        super(SimpleDictParser.transformParserDict(parserDict));
    }
}

class TransformFunctionResult<Args extends readonly unknown[], Result> extends Parser<(...args: Args) => ParseResult<Result>, Function> {
    constructor(readonly p: Parser<Result>) {
        super();
    }

    parse(input: Function): ParseResult<(...args: Args) => ParseResult<Result>> {
        return new Success((...xs) => this.p.parse(input(...xs)))
    }
}

class TypeNarrowingParser<Output extends Input, Input=unknown> extends Parser<Output, Input> {
    constructor(
        readonly typeName: string,
        readonly check: (x:Input) => x is Output,
    ) {
        super();
    }

    parse(x: Input) {
        if (this.check(x)) {
            return new Success(x);
        } else {
            return new ParseErrors([new ParseError(
                [],
                "expected " + this.typeName + " but got " + typeof x,
            )]);
        }
    }
}

type AnyObject = {[k:string]:unknown}

export namespace Parsers {
    export const asNull = new TypeNarrowingParser(
        "null",
        (x): x is null => x === null,
    );

    export const asUndefined = new TypeNarrowingParser(
        "undefined",
        (x): x is undefined => x === undefined,
    );

    export const asNumber = new TypeNarrowingParser(
        "number",
        (x): x is number => typeof x === "number",
    );

    export const asString = new TypeNarrowingParser(
        "string",
        (x): x is string => typeof x === "string",
    );

    export const asArray = new TypeNarrowingParser(
        "array",
        (x): x is readonly unknown[] => Array.isArray(x),
    );

    export const asObject = new TypeNarrowingParser(
        "object",
        (x): x is AnyObject => typeof x === "object",
    );

    export const asFunction = new TypeNarrowingParser(
        "function",
        (x): x is Function => typeof x === "function",
    );

    export function parseArray<Output>(p: Parser<Output>): Parser<Output[]> {
        return asArray.bind(new Map(p));
    }

    export function transformFunctionResult<Args extends readonly unknown[], Result>(
        resultP: Parser<Result>,
    ): Parser<(...args: Args) => Success<Result> | ParseErrors> {
        return asFunction.bind(new TransformFunctionResult(resultP));
    }
}
