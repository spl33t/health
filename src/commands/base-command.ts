export abstract class BaseCommand<TArgs = void, TResult = void> {
    abstract execute(args: TArgs): Promise<TResult> | TResult;
}

