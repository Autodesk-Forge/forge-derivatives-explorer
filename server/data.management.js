'use strict'; // http://www.w3schools.com/js/js_strict.asp

// token handling in session
var token = require('./token');

// web framework
var express = require('express');
var router = express.Router();

var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();

var formidable = require('formidable');
var path = require('path');
var fs = require('fs');

var config = require('./config');

var forgeDM = require('forge-data-management');
var forgeOSS = require('forge-oss');
var request = require('request');

function setToken(forge, req, res) {
    var tokenSession = new token(req.session);
    forge.ApiClient.instance.authentications ['oauth2_access_code'].accessToken =
        tokenSession.getTokenInternal();
    forge.ApiClient.instance.authentications ['oauth2_application'].accessToken =
        tokenSession.getTokenInternal();

    if (!tokenSession.isAuthorized()) {
        res.status(401).json({error: 'Please login first'});
        return null;
    }

    return forge;
}

function getFolderId(projectId, versionId) {
    return new Promise(function (_resolve, _reject) {
        // Figure out the itemId of the file we want to attach the new file to
        var versions = new forgeDM.VersionsApi();
        versions.getVersion(projectId, versionId)
            .then(function (versionData) {
                var itemId = versionData.data.relationships.item.data.id;

                // Figure out the folderId of the file we want to attach the new file to
                var items = new forgeDM.ItemsApi();
                items.getItem(projectId, itemId)
                    .then(function (itemData) {
                        var folderId = itemData.data.relationships.parent.data.id;

                        _resolve(folderId);
                    })
                    .catch(function (error) {
                        console.log(error);
                        _reject(error);
                    });
            })
            .catch(function (error) {
                console.log(error);
                _reject(error);
            });
    });
}

function uploadFile(projectId, folderId, fileName, fileSize, fileTempPath) {
    return new Promise(function (_resolve, _reject) {
        // Ask for storage for the new file we want to upload
        var projects = new forgeDM.ProjectsApi();
        projects.postStorage(projectId, JSON.stringify(storageSpecData(fileName, folderId)))
            .then(function (storageData) {
                var objectId = storageData.data.id;
                var bucketKeyObjectName = getBucketKeyObjectName(objectId);

                fs.readFile(fileTempPath, function (err, fileData) {
                    // Upload the new file
                    var objects = new forgeOSS.ObjectsApi();
                    objects.uploadObject(bucketKeyObjectName.bucketKey, bucketKeyObjectName.objectName, fileSize, fileData)
                        .then(function (objectData) {
                            console.log('uploadObject: succeeded');
                            _resolve(objectData.objectId);
                        })
                        .catch(function (error) {
                            console.log('uploadObject: failed');
                            _reject(error);
                        });
                });
            })
            .catch(function(error) {
                _reject(error);
            });
    });
}

function createNewItemVersion(projectId, folderId, fileName, objectId) {
    return new Promise(function (_resolve, _reject) {

        var folders = new forgeDM.FoldersApi();

        folders.getFolderContents(projectId, folderId)
            .then(function (folderData) {
                var item = null;
                for (var key in folderData.data) {
                    item = folderData.data[key];
                    if (item.attributes.displayName === fileName) {
                        break;
                    } else {
                        item = null;
                    }
                }

                var projects = new forgeDM.ProjectsApi();

                if (item) {
                    // We found it so we should create a new version

                    projects.postVersion(projectId, JSON.stringify(versionSpecData(fileName, item.id, objectId)))
                        .then(function (versionData) {
                            _resolve(versionData.data.id);
                        })
                        .catch(function (error) {
                            console.log('postVersion: failed');

                            _reject(error);
                        });
                } else {
                    // We did not find it so we should create it

                    projects.postItem(projectId, JSON.stringify(itemSpecData(fileName, folderId, objectId)))
                        .then(function (itemData) {
                            // Get the versionId out of the reply
                            _resolve(itemData.included[0].id);
                        })
                        .catch(function (error) {
                            console.log('postItem: failed');

                            _reject(error);
                        });
                }
            })
            .catch(function (error) {
                console.log('getFolderContents: failed');
                _reject(error);
            });
    });
}

function attachVersionToAnotherVersion(projectId, versionId, attachmentVersionId) {
    return new Promise(function (_resolve, _reject) {
        // Ask for storage for the new file we want to upload
        var versions = new forgeDM.VersionsApi();
        versions.postVersionRelationshipsRef(projectId, versionId, JSON.stringify(attachmentSpecData(attachmentVersionId)))
            .then(function () {
                _resolve();
            })
            .catch(function(error) {
                console.log('postVersionRelationshipsRef: failed');
                _reject(error);
            });
    });
}

router.get('/attachments', function (req, res) {
    if (!setToken(forgeDM, req, res))
        return;

    var href = decodeURIComponent(req.query.href);
    var params = href.split('/');
    var projectId = params[params.length - 3];
    var versionId = params[params.length - 1];

    var versions = new forgeDM.VersionsApi();
    versions.getVersionRelationshipsRefs(projectId, versionId)
        .then(function (relationshipsData) {
            var versionRequests = [];
            for (var key in relationshipsData.data) {
                var item = relationshipsData.data[key];
                if (item.meta.extension.type === "auxiliary:autodesk.core:Attachment") {
                    (function (relationshipItem) {
                        var versionRequest = new Promise(function (_resolve, _reject) {
                            versions.getVersion(projectId, relationshipItem.id)
                                .then(function (versionData) {
                                    relationshipItem.displayName =
                                        versionData.data.attributes.displayName +
                                        " (v" + versionData.data.attributes.versionNumber + ")";
                                    _resolve();
                                })
                                .catch(function (error) {
                                    console.log('getVersion: failed');
                                    _reject(error);
                                });
                        });
                        versionRequests.push(versionRequest);
                    })(item);
                }
            };

            Promise.all(versionRequests)
                .then(function () {
                    res.json(relationshipsData);
                })
                .catch(function (error) {
                    console.log('Parallel getVersion: failed');
                    res.status(error.statusCode).end('Parallel getVersion: failed');
                })
        })
        .catch(function(error) {
            console.log('getVersionRelationshipsRef: failed');
            res.status(error.statusCode).end('getVersionRelationshipsRef: failed');
        });
});

// Download a specific attachment of an item version
router.get('/attachments/:attachment', function (req, res) {
    if (!setToken(forgeDM, req, res) || !setToken(forgeOSS, req, res))
        return;

    // From the href of the item version that has the attachment
    // we only need the projectId
    // req.params.attachment contains the versionId of the attachment
    var href = decodeURIComponent(req.query.href);
    var params = href.split('/');
    var projectId = params[params.length - 3];

    //var versionId = params[params.length - 1];

    var versions = new forgeDM.VersionsApi();

    // Get version info first to find out the OSS location
    versions.getVersion(projectId, req.params.attachment)
        .then(function (versionData) {
            var storageId = versionData.data.relationships.storage.data.id;
            var storageHref = versionData.data.relationships.storage.meta.link.href;
            var fileExt = versionData.data.attributes.fileType;
            var bucketKeyObjectName = getBucketKeyObjectName(storageId);

            /*
            var objects = new forgeOSS.ObjectsApi();
            objects.getObject(bucketKeyObjectName.bucketKey, bucketKeyObjectName.objectName)
                .then(function (data) {
                    res.set('content-type', 'application/' + fileExt);
                    res.set('Content-Disposition', 'attachment; filename="' + versionData.data.attributes.displayName + '"');
                    res.end(data);
                })
                .catch(function (error) {
                    console.log('getObject: failed');
                    res.status(error.statusCode).end('getObject: failed');
                })

             The below workaround is needed because the "encoding = null" is not added to the request
                in the /forge-oss/src/ApiClient.js file's exports.prototype.callApi function
             */
            var tokenSession = new token(req.session);
            request({
                url: "https://developer.api.autodesk.com/oss/v2/buckets/" +
                    encodeURIComponent(bucketKeyObjectName.bucketKey) +
                    "/objects/" +
                    encodeURIComponent(bucketKeyObjectName.objectName),
                encoding: null,
                method: "GET",
                headers: {'Authorization': 'Bearer ' + tokenSession.getTokenInternal()}
            }, function (error, response, body) {
                if (error != null) {
                    console.log(error); // connection problems

                    if (body.errors != null)
                        console.log(body.errors);

                    res.status(error.statusCode).end(error.statusMessage);
                    return;
                }

                res.set('content-type', 'application/' + fileExt);
                res.set('Content-Disposition', 'attachment; filename="' + versionData.data.attributes.displayName + '"');
                res.end(body);
            })
        })
        .catch(function (error) {
            console.log('getVersion: failed');
            res.status(error.statusCode).end('getVersion: failed');
        });
});

// Delete the specific attachment relationship between two item versions
router.delete('/attachments/:attachment', function (req, res) {

    if (!setToken(forgeDM, req, res))
        return;

    var href = decodeURIComponent(req.header('wip-href'));
    var params = href.split('/');
    var projectId = params[params.length - 3];
    var versionId = params[params.length - 1];


    var derivatives = getForgeMD(req, res);
    if (!derivatives)
        return;

    derivatives.deleteManifest(req.params.attachment)
        .then(function (data) {
            res.json(data);
        })
        .catch(function (error) {
            res.status(error.statusCode).end(error.statusMessage);
        });
});



router.post('/files', jsonParser, function (req, res) {
    // Uploading a file to A360
    // 1) Check if the file already exists
    // 2) If not then create a new item and upload the file in it
    // 3) If yes, then create a new version

    var fileName = '';
    var form = new formidable.IncomingForm();

    // The two helper we are using are
    // forgeDM & forgeOSS
    if (!setToken(forgeDM, req, res) || !setToken(forgeOSS, req, res))
        return;

    // Find out the project where we have to upload the file
    var href = decodeURIComponent(req.header('wip-href'));
    var params = href.split('/');
    var projectId = params[params.length - 3];
    var versionId = params[params.length - 1];
    var uploadedFile;

    // Receive the file
    var fileData;

    form
        .on('data', function(data) {
            fileData = data;
        })

        .on('field', function (field, value) {
            console.log(field, value);
        })
        .on('file', function (field, file) {
            console.log(field, file);
            uploadedFile = file;
        })
        .on('end', function () {
            if (uploadedFile.name == '') {
                res.status(500).end('No file submitted!');
            }

            console.log('-> file received');

            // Create file on A360

            // Get the folder where the selected item is
            getFolderId(projectId, versionId)
                .then(function (folderId) {
                    // projectId, folderId, fileName, fileSize, fileTempPath
                    uploadFile(projectId, folderId, uploadedFile.name, uploadedFile.size, uploadedFile.path)
                        .then(function (objectId) {
                            createNewItemVersion(projectId, folderId, uploadedFile.name, objectId)
                                .then(function (attachmentVersionId) {
                                    attachVersionToAnotherVersion(projectId, versionId, attachmentVersionId)
                                        .then(function () {
                                            res.status(200).json({fileName: uploadedFile.name, objectId: objectId});
                                        })
                                        .catch(function (error) {
                                            console.log('attachVersionToAnotherVersion: failed');
                                            res.status(error.statusCode).end('attachVersionToAnotherVersion: failed');
                                        });
                                })
                                .catch(function (error) {
                                    console.log('createNewItemVersionInFolder: failed');
                                    res.status(error.statusCode).end('createNewItemVersionInFolder: failed');
                                });
                        })
                        .catch(function (error) {
                            console.log('uploadFile: failed');
                            res.status(error.statusCode).end('uploadFile: failed');
                        });
                })
                .catch(function (error) {
                    console.log('getFolderId: failed');
                    res.status(error.statusCode).end('getFolderId: failed');
                });
        });

    form.parse(req);
});

function getBucketKeyObjectName(objectId) {
    // the objectId comes in the form of
    // urn:adsk.objects:os.object:BUCKET_KEY/OBJECT_NAME
    var objectIdParams = objectId.split('/');
    var objectNameValue = objectIdParams[objectIdParams.length - 1];
    // then split again by :
    var bucketKeyParams = objectIdParams[objectIdParams.length - 2].split(':');
    // and get the BucketKey
    var bucketKeyValue = bucketKeyParams[bucketKeyParams.length - 1];

    var ret = {
        bucketKey: bucketKeyValue,
        objectName: objectNameValue
    };

    return ret;
}

function storageSpecData(fileName, folderId) {
    var storageSpecs = {
        data: {
            type: 'objects',
            attributes: {
                name: fileName
            },
            relationships: {
                target: {
                    data: {
                        type: 'folders',
                        id: folderId
                    }
                }
            }
        }
    };

    console.log(storageSpecs);

    return storageSpecs;
}

function itemSpecData(fileName, folderId, objectId) {
    var itemSpec = {
        jsonapi: {
            version: "1.0"
        },
        data: [{
            type: "items",
            attributes: {
                name: fileName,
                extension: {
                    type: "items:autodesk.core:File",
                    version: "1.0"
                }
            },
            relationships: {
                tip: {
                    data: {
                        type: "versions",
                        id: "1"
                    }
                },
                parent: {
                    data: {
                        type: "folders",
                        id: folderId
                    }
                }
            }
        }],
        included: [{
            type: "versions",
            id: "1",
            attributes: {
                name: fileName
            },
            relationships: {
                storage: {
                    data: {
                        type: "objects",
                        id: objectId
                    }
                }
            }
        }]
    };


    if (fileName.endsWith(".iam.zip")) {
        itemSpec.data[0].attributes.extension.type = "versions:autodesk.a360:CompositeDesign";
        itemSpec.data[0].attributes.name = fileName.slice(0, -4);
        itemSpec.included[0].attributes.name = fileName.slice(0, -4);
    }

    console.log(itemSpec);

    return itemSpec;
}

function versionSpecData(fileName, itemId, objectId) {
    var versionSpec = {
        "jsonapi": {
            "version": "1.0"
        },
        "data": {
            "type": "versions",
            "attributes": {
                "name": fileName,
                "extension": {
                    "type": "versions:autodesk.core:File",
                    "version": "1.0"
                }
            },
            "relationships": {
                "item": {
                    "data": {
                        "type": "items",
                        "id": itemId
                    }
                },
                "storage": {
                    "data": {
                        "type": "objects",
                        "id": objectId
                    }
                }
            }
        }
    }

    if (fileName.endsWith(".iam.zip")) {
        versionSpec.data.attributes.extension.type = "versions:autodesk.a360:CompositeDesign";
        versionSpec.data.attributes.name = fileName.slice(0, -4);
    }

    console.log(versionSpec);

    return versionSpec;
}

function attachmentSpecData(versionId) {

    var attachmentSpec = {
        "jsonapi": {
            "version": "1.0"
        },
        "data": {
            "type": "versions",
            "id": versionId,
            "meta": {
                "extension": {
                    "type": "auxiliary:autodesk.core:Attachment",
                    "version": "1.0"
                }
            }
        }
    }

    return attachmentSpec;
}

/////////////////////////////////////////////////////////////////
// Provide information to the tree control on the client
// about the hubs, projects, folders and files we have on
// our A360 account
/////////////////////////////////////////////////////////////////
router.get('/treeNode', function (req, res) {
    var href = decodeURIComponent(req.query.href);
    console.log("treeNode for " + href);

    if (!setToken(forgeDM, req, res))
        return;

    if (href === '#') {
        // # stands for ROOT
        var hubs = new forgeDM.HubsApi();
        hubs.getHubs()
            .then(function (data) {
                //res.end(makeTree(data.data, true));
                res.json(makeTree(data.data, true));
            })
            .catch(function (error) {
                console.log(error);
            });
    } else {
        var params = href.split('/');
        var resourceName = params[params.length - 2];
        var resourceId = params[params.length - 1];
        switch (resourceName) {
            case 'hubs':
                // if the caller is a hub, then show projects
                var hubs = new forgeDM.HubsApi();
                hubs.getHubProjects(resourceId/*hub_id*/)
                    .then(function (projects) {
                        //res.end(makeTree(projects.data, true));
                        res.json(makeTree(projects.data, true));
                    })
                    .catch(function (error) {
                        console.log(error);
                    });
                break;
            case 'projects':
                // if the caller is a project, then show folders
                var hubId = params[params.length - 3];
                var projects = new forgeDM.ProjectsApi();
                projects.getProject(hubId, resourceId/*project_id*/)
                    .then(function (project) {
                        var rootFolderId = project.data.relationships.rootFolder.data.id;
                        var folders = new forgeDM.FoldersApi();
                        folders.getFolderContents(resourceId, rootFolderId)
                            .then(function (folderContents) {
                                //res.end(makeTree(folderContents.data, true));
                                res.json(makeTree(folderContents.data, true));
                            })
                            .catch(function (error) {
                                console.log(error);
                            });
                    })
                    .catch(function (error) {
                        console.log(error);
                    });
                break;
            case 'folders':
                // if the caller is a folder, then show contents
                var projectId = params[params.length - 3];
                var folders = new forgeDM.FoldersApi();
                folders.getFolderContents(projectId, resourceId/*folder_id*/)
                    .then(function (folderContents) {
                        //res.end(makeTree(folderContents.data, true));
                        res.json(makeTree(folderContents.data, true));
                    })
                    .catch(function (error) {
                        console.log(error);
                    });
                break;
            case 'items':
                // if the caller is an item, then show versions
                var projectId = params[params.length - 3];
                var items = new forgeDM.ItemsApi();
                items.getItemVersions(projectId, resourceId/*item_id*/)
                    .then(function (versions) {
                        //res.end(makeTree(versions.data, false));
                        res.json(makeTree(versions.data, false));
                    })
                    .catch(function (error) {
                        console.log(error);
                    });
        }
    }
});

/////////////////////////////////////////////////////////////////
// Collects the information that we need to pass to the
// file tree object on the client
/////////////////////////////////////////////////////////////////
function makeTree(items, canHaveChildren, data) {
    if (!items) return '';
    var treeList = [];
    items.forEach(function (item, index) {
        var fileExt = (item.attributes ? item.attributes.fileType : null);
        if (!fileExt && item.attributes && item.attributes.name) {
            var fileNameParts = item.attributes.name.split('.');
            if (fileNameParts.length > 1) {
                fileExt = fileNameParts[fileNameParts.length - 1];
            }
        }

        var versionText = "";
        if (item.type === "versions") {
            versionText = " (v" + item.attributes.versionNumber + ")";
        }

        var treeItem = {
            href: item.links.self.href,
            wipid: item.id,
            storage: (item.relationships != null && item.relationships.storage != null ? item.relationships.storage.data.id : null),
            data: (item.relationships != null && item.relationships.derivatives != null ? item.relationships.derivatives.data.id : null),
            text: (item.attributes.displayName == null ? item.attributes.name : item.attributes.displayName) + versionText,
            fileName: (item.attributes ? item.attributes.name : null),
            rootFileName: (item.attributes ? item.attributes.name : null),
            fileExtType: (item.attributes && item.attributes.extension ? item.attributes.extension.type : null),
            fileType: fileExt,
            type: item.type,
            children: canHaveChildren
        };
        console.log(treeItem);
        treeList.push(treeItem);
    });

    //return JSON.stringify(treeList);
    return treeList;
}

/////////////////////////////////////////////////////////////////
// Return the router object that contains the endpoints
/////////////////////////////////////////////////////////////////
module.exports = router;