import { ComponentProps } from 'react';
import { Translation, TooltipSymbol } from 'src/components/suite';
import styled from 'styled-components';
import { Tooltip, variables } from '@trezor/components';

const NoRatesMessage = styled.div`
    display: flex;
    align-items: center;
    color: ${({ theme }) => theme.TYPE_LIGHT_GREY};
    font-size: ${variables.FONT_SIZE.TINY};
    font-weight: ${variables.FONT_WEIGHT.REGULAR};
    text-transform: none;
`;

interface NoRatesTooltipProps extends Partial<typeof Tooltip> {
    customText?: ComponentProps<typeof Translation>['id'];
    customTooltip?: ComponentProps<typeof Translation>['id'];
    iconOnly?: boolean;
    className?: string;
}

const NoRatesTooltip = ({
    customText,
    iconOnly,
    customTooltip,
    className,
}: NoRatesTooltipProps) => (
    <NoRatesMessage className={className}>
        {!iconOnly && <Translation id={customText || 'TR_FIAT_RATES_NOT_AVAILABLE'} />}
        <TooltipSymbol
            content={<Translation id={customTooltip || 'TR_FIAT_RATES_NOT_AVAILABLE_TOOLTIP'} />}
        />
    </NoRatesMessage>
);

export default NoRatesTooltip;