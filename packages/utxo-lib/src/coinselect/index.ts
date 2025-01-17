import { accumulative } from './inputs/accumulative';
import { bnb } from './inputs/bnb';
import { sortByScore, anyOf } from './coinselectUtils';
import { tryConfirmed } from './tryconfirmed';
import { CoinSelectInput, CoinSelectOutput, CoinSelectOptions } from '../types';

export function coinselect(
    inputs: CoinSelectInput[],
    outputs: CoinSelectOutput[],
    feeRate: number,
    options: CoinSelectOptions,
) {
    const sortedInputs = options.skipPermutation ? inputs : inputs.sort(sortByScore(feeRate));
    const algorithm = tryConfirmed(anyOf([bnb, accumulative]), options);
    return algorithm(sortedInputs, outputs, feeRate, options);
}
