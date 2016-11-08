/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

'use strict'; // http://www.w3schools.com/js/js_strict.asp

// token handling in session
var token = require('./token');

// web framework
var express = require('express');
var router = express.Router();

// forge oAuth package
var forgeOAuth2 = require('forge-oauth2');
// forge config information, such as client ID and secret
var config = require('./config');

// this end point will logoff the user by destroying the session
// as of now there is no Forge endpoint to invalidate tokens
router.get('/user/logoff', function (req, res) {
    req.session.destroy();
    res.end('/');
});

// return name & picture of the user for the front-end
// the forge @me endpoint returns more information
router.get('/user/profile', function (req, res) {
    var tokenSession = new token(req.session);
    forgeOAuth2.ApiClient.instance.authentications ['oauth2_access_code'].accessToken = tokenSession.getTokenInternal();
    var oa3Info = new forgeOAuth2.InformationalApi();
    oa3Info.aboutMe()
        .then(function (data) {
            var profile = {
                'name': data.firstName + ' ' + data.lastName,
                'picture': data.profileImages.sizeX20
            };
            res.end(JSON.stringify(profile));
        })
        .catch(function (error) {
            console.log(error);
        });
});

// return the public token of the current user
// the public token should have a limited scope (read-only)
router.get('/user/token', function (req, res) {
    console.log('Getting user token'); // debug
    var tokenSession = new token(req.session);
    console.log('Public token:' + tokenSession.getTokenPublic());
    res.json({ token: tokenSession.getTokenPublic(), expires_in: tokenSession.getExpiresInPublic() });
});

// return the forge authenticate url
router.get('/user/authenticate', function (req, res) {
    // redirect the user to this page
    var url =
        forgeOAuth2.ApiClient.instance.basePath +
        '/authentication/v1/authorize?response_type=code' +
        '&client_id=' + config.credentials.client_id +
        '&redirect_uri=' + config.callbackURL +
        '&scope=' + config.scopeInternal;
    res.end(url);
});

// wait for Autodesk callback (oAuth callback)
router.get('/api/forge/callback/oauth', function (req, res) {
    var code = req.query.code;
    var oauth3legged = new forgeOAuth2.ThreeLeggedApi();
    var tokenSession = new token(req.session);

    // first get a full scope token for internal use (server-side)
    oauth3legged.gettoken(config.credentials.client_id, config.credentials.client_secret, 'authorization_code', code, config.callbackURL)
        .then(function (data) {
            tokenSession.setTokenInternal(data.access_token);
            console.log('Internal token (full scope): ' + tokenSession.getTokenInternal()); // debug

            // then refresh and get a limited scope token that we can send to the client
            oauth3legged.refreshtoken(config.credentials.client_id, config.credentials.client_secret, 'refresh_token', data.refresh_token, config.scopePublic)
                .then(function (data) {
                    tokenSession.setTokenPublic(data.access_token);
                    tokenSession.setExpiresInPublic(data.expires_in);
                    console.log('Public token (limited scope): ' + tokenSession.getTokenPublic()); // debug
                    res.redirect('/');
                })
                .catch(function (error) {
                    res.end(JSON.stringify(error));
                });
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
});

module.exports = router;