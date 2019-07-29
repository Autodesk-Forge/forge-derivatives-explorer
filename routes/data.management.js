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

var forgeSDK = require('forge-apis');

function getFolderId(projectId, versionId, req) {
    return new Promise(function (_resolve, _reject) {
        // Figure out the itemId of the file we want to attach the new file to
        var tokenSession = new token(req.session);

        var versions = new forgeSDK.VersionsApi();

        versions.getVersion(projectId, versionId, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
            .then(function (versionData) {
                var itemId = versionData.body.data.relationships.item.data.id;

                // Figure out the folderId of the file we want to attach the new file to
                var items = new forgeSDK.ItemsApi();
                items.getItem(projectId, itemId, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                    .then(function (itemData) {
                        var folderId = itemData.body.data.relationships.parent.data.id;

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

function uploadFile(projectId, folderId, fileName, fileSize, fileTempPath, req) {
    return new Promise(function (_resolve, _reject) {
        // Ask for storage for the new file we want to upload
        var tokenSession = new token(req.session);

        var projects = new forgeSDK.ProjectsApi();
        var body = storageSpecData(fileName, folderId);
        projects.postStorage(projectId, body, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
            .then(function (storageData) {
                var objectId = storageData.body.data.id;
                var bucketKeyObjectName = getBucketKeyObjectName(objectId);

                fs.readFile(fileTempPath, function (err, fileData) {
                    // Upload the new file
                    var objects = new forgeSDK.ObjectsApi();
                    objects.uploadObject(bucketKeyObjectName.bucketKey, bucketKeyObjectName.objectName, fileSize, fileData, {}, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                        .then(function (objectData) {
                            console.log('uploadObject: succeeded');
                            _resolve(objectData.body.objectId);
                        })
                        .catch(function (error) {
                            console.log('uploadObject: failed');
                            _reject(error);
                        });
                });
            })
            .catch(function(error) {
                console.log('postStorage: failed');
                _reject(error);
            });
    });
}

function createNewItemVersion(projectId, folderId, fileName, objectId, req) {
    return new Promise(function (_resolve, _reject) {

        var tokenSession = new token(req.session);

        var folders = new forgeSDK.FoldersApi();
        folders.getFolderContents(projectId, folderId, {}, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
            .then(function (folderData) {
                var item = null;
                for (var key in folderData.body.data) {
                    item = folderData.body.data[key];
                    if (item.attributes.displayName === fileName) {
                        break;
                    } else {
                        item = null;
                    }
                }

                if (item) {
                    // We found it so we should create a new version
                    var versions = new forgeSDK.VersionsApi();
                    var body = versionSpecData(fileName, projectId, item.id, objectId);
                    versions.postVersion(projectId, body, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                        .then(function (versionData) {
                            _resolve(versionData.body.data.id);
                        })
                        .catch(function (error) {
                            console.log('postVersion: failed');

                            _reject(error);
                        });
                } else {
                    // We did not find it so we should create it
                    var items = new forgeSDK.ItemsApi();
                    var body = itemSpecData(fileName, projectId, folderId, objectId);
                    items.postItem(projectId, body, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                        .then(function (itemData) {
                            // Get the versionId out of the reply
                            _resolve(itemData.body.included[0].id);
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

function attachVersionToAnotherVersion(projectId, versionId, attachmentVersionId, req) {
    return new Promise(function (_resolve, _reject) {
        var tokenSession = new token(req.session);

        // Ask for storage for the new file we want to upload
        var versions = new forgeSDK.VersionsApi();
        var body = attachmentSpecData(attachmentVersionId, projectId);
        versions.postVersionRelationshipsRef(projectId, versionId, body, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
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

    var tokenSession = new token(req.session);

    var href = decodeURIComponent(req.query.href);
    var params = href.split('/');
    var projectId = params[params.length - 3];
    var versionId = params[params.length - 1];

    var versions = new forgeSDK.VersionsApi();
    versions.getVersionRelationshipsRefs(projectId, versionId, {}, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
        .then(function (relationshipsData) {
            var versionRequests = [];
            for (var key in relationshipsData.body.data) {
                var item = relationshipsData.body.data[key];
                if (item.meta.extension.type === "auxiliary:autodesk.core:Attachment") {
                    (function (relationshipItem) {
                        var versionRequest = new Promise(function (_resolve, _reject) {
                            versions.getVersion(projectId, relationshipItem.id, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                                .then(function (versionData) {
                                    relationshipItem.displayName =
                                        versionData.body.data.attributes.displayName +
                                        " (v" + versionData.body.data.attributes.versionNumber + ")";
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
                    res.json(relationshipsData.body);
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

    var tokenSession = new token(req.session);

    // From the href of the item version that has the attachment
    // we only need the projectId
    // req.params.attachment contains the versionId of the attachment
    var href = decodeURIComponent(req.query.href);
    var params = href.split('/');
    var projectId = params[params.length - 3];

    var versions = new forgeSDK.VersionsApi();

    // Get version info first to find out the OSS location
    versions.getVersion(projectId, req.params.attachment, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
        .then(function (versionData) {
            var storageId = versionData.body.data.relationships.storage.data.id;
            var storageHref = versionData.body.data.relationships.storage.meta.link.href;
            var fileExt = versionData.body.data.attributes.fileType;
            var bucketKeyObjectName = getBucketKeyObjectName(storageId);

            var objects = new forgeSDK.ObjectsApi();
            objects.getObject(bucketKeyObjectName.bucketKey, bucketKeyObjectName.objectName, {}, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                .then(function (data) {
                     res.set('content-type', 'application/' + fileExt);
                     res.set('Content-Disposition', 'attachment; filename="' + versionData.body.data.attributes.displayName + '"');
                     res.end(data.body);
                })
                .catch(function (error) {
                    console.log('getObject: failed');
                    res.status(error.statusCode).end('getObject: failed');
                })
        })
        .catch(function (error) {
            console.log('getVersion: failed');
            res.status(error.statusCode).end('getVersion: failed');
        });
});

// Delete the specific attachment relationship between two item versions
router.delete('/attachments/:attachment', function (req, res) {

    var tokenSession = new token(req.session);

    var href = decodeURIComponent(req.header('wip-href'));
    var params = href.split('/');
    var projectId = params[params.length - 3];
    var versionId = params[params.length - 1];

    var derivatives = new forgeSDK.DerivativesApi();
    if (!derivatives)
        return;

    derivatives.deleteManifest(req.params.attachment, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
        .then(function (data) {
            res.json(data.body);
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
            getFolderId(projectId, versionId, req)
                .then(function (folderId) {
                    // projectId, folderId, fileName, fileSize, fileTempPath
                    console.log('uploadFile.size: ' + uploadedFile.size);
                    console.log('uploadFile.name: ' + uploadedFile.name);
                    console.log('uploadFile.path: ' + uploadedFile.path);
                    uploadFile(projectId, folderId, uploadedFile.name, uploadedFile.size, uploadedFile.path, req)
                        .then(function (objectId) {
                            createNewItemVersion(projectId, folderId, uploadedFile.name, objectId, req)
                                .then(function (attachmentVersionId) {
                                    attachVersionToAnotherVersion(projectId, versionId, attachmentVersionId, req)
                                        .then(function () {
                                            res.status(200).json({fileName: uploadedFile.name, objectId: objectId});
                                        })
                                        .catch(function (error) {
                                            console.log('attachVersionToAnotherVersion: failed');
                                            res.status(error.statusCode).end('attachVersionToAnotherVersion: failed');
                                        });
                                })
                                .catch(function (error) {
                                    console.log('createNewItemVersion: failed');
                                    res.status(error.statusCode).end('createNewItemVersion: failed');
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
        jsonapi: {
            version: "1.0"
        },
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

// added included >> attributes >> extension on 2017-02-22
function itemSpecData(fileName, projectId, folderId, objectId) {
    var itemsType = projectId.startsWith("a.") ? "items:autodesk.core:File" : "items:autodesk.bim360:File";
    var versionsType = projectId.startsWith("a.") ? "versions:autodesk.core:File" : "versions:autodesk.bim360:File";
    var itemSpec = {
        jsonapi: {
            version: "1.0"
        },
        data: {
            type: "items",
            attributes: {
                displayName: fileName,
                extension: {
                    type: itemsType,
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
        },
        included: [{
            type: "versions",
            id: "1",
            attributes: {
                name: fileName,
                extension: {
                    type: versionsType,
                    version: "1.0"
                }
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

function versionSpecData(fileName, projectId, itemId, objectId) {
    var versionsType = projectId.startsWith("a.") ? "versions:autodesk.core:File" : "versions:autodesk.bim360:File";

    var versionSpec = {
        "jsonapi": {
            "version": "1.0"
        },
        "data": {
            "type": "versions",
            "attributes": {
                "name": fileName,
                "extension": {
                    "type": versionsType,
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

function attachmentSpecData(versionId, projectId) {
    var extensionType = projectId.startsWith("a.") ? "auxiliary:autodesk.core:Attachment" : "derived:autodesk.bim360:FileToDocument";

    var attachmentSpec = {
        "jsonapi": {
            "version": "1.0"
        },
        "data": {
            "type": "versions",
            "id": versionId,
            "meta": {
                "extension": {
                    "type": extensionType,
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

    var tokenSession = new token(req.session);

    if (href === '#') {
        // # stands for ROOT
        var hubs = new forgeSDK.HubsApi();

        try {
            hubs.getHubs({}, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
            .then(function (data) {
                res.json(makeTree(data.body.data, true));
            })
            .catch(function (error) {
                console.log(error);
            });
        } catch (ex) {
            console.log(ex);
        }  
    } else {
        var params = href.split('/');
        var resourceName = params[params.length - 2];
        var resourceId = params[params.length - 1];
        switch (resourceName) {
            case 'hubs':
                // if the caller is a hub, then show projects
                var projects = new forgeSDK.ProjectsApi();

                projects.getHubProjects(resourceId/*hub_id*/, {}, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                    .then(function (projects) {
                        res.json(makeTree(projects.body.data, true));
                    })
                    .catch(function (error) {
                        console.log(error);
                    });
                break;
            case 'projects':
                // if the caller is a project, then show folders
                var hubId = params[params.length - 3];

                var projects = new forgeSDK.ProjectsApi();

                // resourceId contains project_id

              /*
                projects.getProject(hubId, resourceId, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                    .then(function (project) {
                        var rootFolderId = project.body.data.relationships.rootFolder.data.id;
                        var folders = new forgeSDK.FoldersApi();
                        folders.getFolderContents(resourceId, rootFolderId, {}, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                            .then(function (folderContents) {
                                res.json(makeTree(folderContents.body.data, true));
                            })
                            .catch(function (error) {
                                console.log(error);
                            });



                    })
                    .catch(function (error) {
                        console.log(error);
                    });

              */

                // Work with top folders instead
                var projects = new forgeSDK.ProjectsApi();
                projects.getProjectTopFolders(hubId, resourceId, tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                  .then(function (topFolders) {
                      res.json(makeTree(topFolders.body.data, true));
                  })
                  .catch(function (error) {
                      console.log(error);
                  });

                break;
            case 'folders':
                // if the caller is a folder, then show contents
                var projectId = params[params.length - 3];
                var folders = new forgeSDK.FoldersApi();
                folders.getFolderContents(projectId, resourceId/*folder_id*/, {}, 
                    tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                    .then(function (folderContents) {
                        res.json(makeTree(folderContents.body.data, true));
                    })
                    .catch(function (error) {
                        console.log(error);
                    });
                break;
            case 'items':
                // if the caller is an item, then show versions
                var projectId = params[params.length - 3];
                var items = new forgeSDK.ItemsApi();
                items.getItemVersions(projectId, resourceId/*item_id*/, {}, 
                    tokenSession.getInternalOAuth(), tokenSession.getInternalCredentials())
                    .then(function (versions) {
                        res.json(makeTree(versions.body.data, false));
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

    return treeList;
}

// Get the item id and version number from the
// base64 encoded version id
function getIdAndVersion(urn64) {
    var urn = new Buffer(urn64, 'base64').toString("ascii");
    // urn will be something like this:
    // urn:adsk.wipprod:fs.file:vf.dhFQocFPTdy5brBtQVvuCQ?version=1
    urn = urn.replace('urn:adsk.wipprod:fs.file:vf.', '')
    var parts = urn.split('?version=');

    var itemId = parts[0];
    var version = parts[1];

    return { itemId: "urn:adsk.wipprod:dm.lineage:" + itemId, version: parseInt(version) };
}

// Expose an end point through which the client can check if our
// mongo db contains info about the selected body
router.get('/fusionData/:urn/:path', function (req, res) {
    var urn = req.params.urn;
    var path = req.params.path;

    var mongodb = require('mongodb');
    var mongoClient = mongodb.MongoClient;

    // You could also put the connection URL here, but it's nicer to have it
    // in an Environment variable - MLAB_URL
    mongoClient.connect(process.env.MLAB_URL, function(err, db){
        if (err) {
            console.log(err);
            console.log("Failed to connect to MongoDB on mLab");
            res.status(500).end();
        } else {
            mongoClient.db = db; // keep connection
            console.log("Connected to MongoDB on mLab");

            var query = getIdAndVersion(urn);
            query.fullPath = path;

            var coll = db.collection("mycollection");

            coll.find(query).toArray(function(err, results) {
                console.log(results);

                res.json(results);
            });
        }
    });
})

/////////////////////////////////////////////////////////////////
// Return the router object that contains the endpoints
/////////////////////////////////////////////////////////////////
module.exports = router;