// SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
//
// SPDX-License-Identifier: EUPL-1.2
import { SvgIconProps } from '@mui/material';

import AccessibleSvgIcon from './helpers/AccessibleSvgIcon';
import Favorite from './source/favorite.svg?react';

const FavoriteIcon = (props: SvgIconProps) => <AccessibleSvgIcon {...props} component={Favorite} />;

export default FavoriteIcon;
