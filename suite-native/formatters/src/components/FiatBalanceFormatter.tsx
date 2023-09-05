import React from 'react';

import { Box, Text } from '@suite-native/atoms';
import { useFormatters } from '@suite-common/formatters';
import { prepareNativeStyle, useNativeStyles } from '@trezor/styles';

import { FormatterProps } from '../types';
import { EmptyAmountText } from './EmptyAmountText';
import { AmountText } from './AmountText';

/** Matches three groups: 1. currency symbol,  2. whole number part and 3. decimal part. */
const BALANCE_REGEX = /^(\D+)([\d,]+)(?:\.(\d+))?$/u;

type BalanceFormatterProps = FormatterProps<string | null>;

const wholeNumberStyle = prepareNativeStyle(utils => ({
    flexShrink: 1,
    marginBottom: -utils.spacings.small,
    textAlign: 'center',
}));

const parseBalanceAmount = (value: string) => {
    const regexGroups = value.match(BALANCE_REGEX);
    const [_, currencySymbol, wholeNumberPart, decimalNumberPart] = regexGroups ?? [
        null,
        null,
        null,
    ];

    return {
        currencySymbol,
        wholeNumber: wholeNumberPart,
        decimalNumber: decimalNumberPart ? `.${decimalNumberPart}` : '',
    };
};

export const FiatBalanceFormatter = ({ value }: BalanceFormatterProps) => {
    const { applyStyle } = useNativeStyles();
    const { FiatAmountFormatter: formatter } = useFormatters();

    if (!value) return <EmptyAmountText />;

    const formattedValue = formatter.format(value);

    if (!formattedValue) return <EmptyAmountText />;

    const { currencySymbol, wholeNumber, decimalNumber } = parseBalanceAmount(formattedValue);

    return (
        <Box flexDirection="row" alignItems="flex-end" flexShrink={1}>
            <Text variant="titleSmall" color="textSubdued">
                {currencySymbol}
            </Text>
            <AmountText
                value={wholeNumber}
                variant="titleLarge"
                isDiscreetText
                style={applyStyle(wholeNumberStyle)}
            />
            <AmountText
                value={decimalNumber}
                variant="titleSmall"
                color="textSubdued"
                isDiscreetText
            />
        </Box>
    );
};
