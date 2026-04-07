// SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
//
// SPDX-License-Identifier: EUPL-1.2
import { useMemo } from 'react';

import { useGetMeQuery } from '../api/rest';
import { useAppSelector } from '.';
import { selectAdminEmails } from '../store/slices/configSlice';

const normalize = (value: string) => value.trim().toLowerCase();

export const useIsAdminUser = () => {
  const { data } = useGetMeQuery();
  const adminEmails = useAppSelector(selectAdminEmails);

  return useMemo(() => {
    const email = data?.email;
    if (!email || !adminEmails || adminEmails.length === 0) {
      return false;
    }

    const normalizedEmail = normalize(email);
    return adminEmails.some((adminEmail: string) => normalize(adminEmail) === normalizedEmail);
  }, [adminEmails, data?.email]);
};

export default useIsAdminUser;
