import "./src/index.css"
import React from 'react'

import { AuthConfig } from "react-use-auth";
import { Auth0 } from "react-use-auth/auth0";
import { navigate } from "gatsby";
export const wrapPageElement = ({ element }) => (
    <>
        <AuthConfig
            authProvider={Auth0}
            navigate={navigate}
            params={{
                domain: "dev-bwu1qlejyms2gwlu.eu.auth0.com",
                clientID: "Rx12CygrBGpiUxYtw8Xa30UHORUcPmej"
            }}
        />
        {element}
    </>
);