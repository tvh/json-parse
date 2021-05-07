export class Success<A> {
    constructor(readonly value: A) {}
}

export class Errors {
    constructor(readonly errors: Error[]) {}
}

export class Error {
    constructor(
        readonly path: Path,
        readonly error: string | ErrorAlternatives,
    ) {}

    prependPath(pathElement: PathElement): Error {
        return new Error(
            [
                pathElement,
                ...this.path
            ],
            this.error,
        );
    }
}

export class ErrorAlternatives {
    constructor(readonly errors: readonly Errors[]) {}
}

export type PathElement = number | string;
export type Path = readonly PathElement[];

export abstract class Parser<Output, Input=unknown> {
    abstract parse(input: Input): Success<Output> | Errors;

    bind<O2>(p2: Parser<O2, Output>): Parser<O2, Input> {
        return new Bind(this, p2);
    }

    get asNull(): Parser<null, Input> { return this.bind(Parsers.asNull) }
    get asUndefined(): Parser<undefined, Input> { return this.bind(Parsers.asUndefined) }
    get asNumber(): Parser<number, Input> { return this.bind(Parsers.asNumber) }
    get asString(): Parser<string, Input> { return this.bind(Parsers.asString) }
    get asArray(): Parser<readonly unknown[], Input> { return this.bind(Parsers.asArray) }
    get asObject(): Parser<Object, Input> { return this.bind(Parsers.asObject) }
    get asFunction(): Parser<Function, Input> { return this.bind(Parsers.asFunction) }

    map<Output>(p: Parser<Output>): Parser<Output[]> {return this.bind(Parsers.map(p)) }
}

class Bind<Output, Input, Intermediate> extends Parser<Output, Input> {
    constructor(
        readonly p1: Parser<Intermediate, Input>,
        readonly p2: Parser<Output, Intermediate>,
    ) {
        super();
    }

    parse(input: Input): Errors | Success<Output> {
        const x = this.p1.parse(input);
        if (x instanceof Errors) {
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

    parse(inputs: readonly Input[]): Errors | Success<Output[]> {
        const errors: Error[] = [];
        const results: Output[] = [];

        inputs.forEach((input, i) => {
            const res = this.p.parse(input);
            if (res instanceof Errors) {
                errors.push(...res.errors.map(e => e.prependPath(i)));
            } else {
                results.push(res.value);
            }
        });

        if (errors.length !== 0) {
            return new Errors(errors);
        } else {
            return new Success(results);
        }
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
            return new Errors([new Error(
                [],
                "expected " + this.typeName + " but got " + typeof x,
            )]);
        }
    }
}

export namespace Parsers {
    export const asNull = new TypeNarrowingParser(
        "null",
        (x): x is null => x === null,
    );

    export const asUndefined = new TypeNarrowingParser(
        "null",
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
        (x): x is Object => typeof x === "object",
    );

    export const asFunction = new TypeNarrowingParser(
        "function",
        (x): x is Function => typeof x === "function",
    );

    export function map<Output>(p: Parser<Output>): Parser<Output[]> {
        return asArray.bind(new Map(p));
    }
}
