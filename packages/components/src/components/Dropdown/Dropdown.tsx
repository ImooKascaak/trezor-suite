import React, {
    useState,
    useRef,
    useLayoutEffect,
    forwardRef,
    useImperativeHandle,
    useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { borders } from '@trezor/theme';
import { useOnClickOutside } from '@trezor/react-utils';
import { useTheme } from '../../utils/hooks';
import { Icon } from '../assets/Icon/Icon';
import { Menu, MenuProps } from './Menu';
import { Coords, getAdjustedCoords } from './getAdjustedCoords';

const MoreIcon = styled(Icon)<{ $isDisabled?: boolean }>`
    transition: background 0.2s;
    border-radius: ${borders.radii.xs};

    :hover {
        background: ${({ $isDisabled, theme }) => !$isDisabled && theme.backgroundNeutralSubdued};
    }
`;

export type DropdownProps = Omit<MenuProps, 'setToggled'> & {
    isDisabled?: boolean;
    renderOnClickPosition?: boolean;
    onToggle?: (isToggled: boolean) => void;
    className?: string;
    children?: React.ReactElement<any>;
};

export interface DropdownRef {
    close: () => void;
    open: () => void;
}

export const Dropdown = forwardRef(
    (
        {
            items,
            isDisabled,
            renderOnClickPosition,
            masterLink,
            alignMenu = 'left',
            onToggle,
            className,
            children,
            ...rest
        }: DropdownProps,
        ref,
    ) => {
        const [toggled, setToggledState] = useState(false);
        const [coords, setCoords] = useState<Coords>();
        const [clickPos, setclickPos] = useState<Coords>();

        const theme = useTheme();
        const menuRef = useRef<HTMLUListElement>(null);
        const toggleRef = useRef<HTMLElement>(null);

        useLayoutEffect(() => {
            if (!toggleRef.current || !menuRef.current) {
                return;
            }

            let coordsToUse: Coords;
            let toggleDimentions;
            if (clickPos) {
                coordsToUse = clickPos;
            } else {
                const { x, y, width, height } = toggleRef.current.getBoundingClientRect();

                coordsToUse = { x, y };
                toggleDimentions = { width, height };
            }

            if (!coordsToUse) {
                return;
            }

            const { width, height } = menuRef.current?.getBoundingClientRect();

            const adjustedCoords = getAdjustedCoords(
                coordsToUse,
                alignMenu,
                { width, height },
                toggleDimentions,
            );

            setCoords(adjustedCoords);
        }, [toggled, clickPos, alignMenu]);

        const setToggled = useCallback(
            (isToggled: boolean) => {
                if (onToggle) onToggle(isToggled);
                setToggledState(isToggled);
            },
            [onToggle],
        );

        useImperativeHandle(ref, () => ({
            close: () => {
                setToggled(false);
            },
        }));

        useOnClickOutside([menuRef, toggleRef], () => {
            if (toggled) {
                setToggled(false);
            }
        });

        const onToggleClick = (e: React.MouseEvent) => {
            if (isDisabled) {
                return;
            }

            setToggled(!toggled);
            if (renderOnClickPosition) {
                setclickPos({ x: e.pageX, y: e.pageY });
            }
        };

        const ToggleComponent = children ? (
            React.cloneElement(children, {
                ref: toggleRef,
                isDisabled,
                onClick: (e: React.MouseEvent): void => {
                    e.stopPropagation();
                    e.preventDefault();
                    children.props.onClick?.(e);
                    onToggleClick(e);
                },
            })
        ) : (
            <MoreIcon
                ref={toggleRef as React.Ref<HTMLDivElement>}
                size={24}
                icon="MORE"
                color={!isDisabled ? theme.TYPE_DARK_GREY : theme.TYPE_LIGHT_GREY}
                $isDisabled={isDisabled}
                onClick={onToggleClick}
                {...rest}
            />
        );

        const PortalMenu = createPortal(
            <Menu
                ref={menuRef}
                items={items}
                coords={coords}
                setToggled={setToggled}
                alignMenu={alignMenu}
                masterLink={masterLink}
            />,
            document.body,
        );

        return (
            <div className={className}>
                {ToggleComponent}
                {toggled && PortalMenu}
            </div>
        );
    },
);
