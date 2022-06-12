var searchPreKeyword = null;
var searchTimer = null;

function clearSearchContent() {
    const content = document.querySelector('div[name="search-content"]');

    while(content.firstChild) {
        content.removeChild(content.firstChild);
    }
}

function closeSearchModal() {
    console.log('close search modal');
    const searchModal = document.querySelector('div[name="search"]');
    searchModal.classList.remove('is-active');
}

function createAnchor(text, href) {
    let anchor = document.createElement('a');
    anchor.href = href;
    anchor.title = href;
    anchor.appendChild(document.createTextNode(text));

    if (!isInnerLink(anchor)) {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            linkToSchema(e.target);
        });
    }

    return anchor;
}

function createSearchResultTable(resources) {
    const table = document.createElement('table');
    table.classList.add('table');
    table.classList.add('is-fullwidth');
    table.classList.add('is-hoverable');

    for (const resource of resources) {
        for (const property of resource.properties) {
            const row = document.createElement('tr');

            const name = `${resource.name}.json#/definitions/${resource.model}.${property.name}`;
            const url = `http://redfish.dmtf.org/schemas/v1/${name}`
            const link = createAnchor(name, url);
            // TODO: clear breadcrumbs.
            link.addEventListener('click', closeSearchModal);
            const nameCell = document.createElement('td');
            nameCell.appendChild(link);
            row.appendChild(nameCell);

            let value = '';
            if (property.value) {
                value = property.value.content;
            }
            const valueCell = document.createElement('td');
            valueCell.appendChild(document.createTextNode(value));
            row.appendChild(valueCell);

            table.appendChild(row);
        }
    }

    const content = document.querySelector('div[name="search-content"]');
    content.appendChild(table);
}

function createSchemaEnumTable(definition) {
    const tbody = document.createElement('tbody');

    for (const value of definition.enum) {
        const valueCell = document.createElement('td');
        valueCell.appendChild(document.createTextNode(value));

        const descCell = document.createElement('td');
        const longDescription = definition.enumLongDescriptions && definition.enumLongDescriptions[value];
        const description = definition.enumDescriptions && definition.enumDescriptions[value];
        const descText = longDescription || description || '';
        descCell.appendChild(document.createTextNode(descText));

        const verAddCell = document.createElement('td');
        const versionAdded = definition.enumVersionAdded && definition.enumVersionAdded[value];
        const verAddText = versionAdded || '';
        verAddCell.appendChild(document.createTextNode(verAddText));

        const typeCell = document.createElement('td');
        const typeText = definition.type || '';
        typeCell.appendChild(document.createTextNode(typeText));

        const row = document.createElement('tr');
        row.appendChild(valueCell);
        row.appendChild(descCell);
        row.appendChild(verAddCell);
        row.appendChild(typeCell);

        tbody.appendChild(row);
    }

    const valueHeader = document.createElement('th');
    valueHeader.appendChild(document.createTextNode('value'));

    const descHeader = document.createElement('th');
    descHeader.appendChild(document.createTextNode('description'));

    const verAddHeader = document.createElement('th');
    verAddHeader.appendChild(document.createTextNode('version added'));

    const typeHeader = document.createElement('th');
    typeHeader.appendChild(document.createTextNode('type'));


    const hrow = document.createElement('tr');
    hrow.appendChild(valueHeader);
    hrow.appendChild(descHeader);
    hrow.appendChild(verAddHeader);
    hrow.appendChild(typeHeader);

    const thead = document.createElement('thead');
    thead.appendChild(hrow);

    const table = document.createElement('table');
    table.classList.add('table');
    table.classList.add('is-fullwidth');
    table.classList.add('is-hoverable');
    table.appendChild(thead);
    table.appendChild(tbody);

    return table;
}

function createSchemaModelTable(modelName, properties) {
    const tbody = document.createElement('tbody');

    for (const name in properties) {
        const property = properties[name];

        let href = property['$ref'];
        if (!href) {
            if (property.items) {
                href = property.items['$ref'];
            } else if (property.anyOf) {
                for (const i of property.anyOf) {
                    href = i['$ref'];
                    if (href) {
                        // TODO: first element only.
                        break;
                    }
                }
            }
        }

        const nameCell = document.createElement('td');
        if (href) {
            let anchor = createAnchor(name, href);
            nameCell.appendChild(anchor);
        } else {
            nameCell.appendChild(document.createTextNode(name));
        }

        const descCell = document.createElement('td');
        const descText = property.longDescription || property.description || '';
        descCell.appendChild(document.createTextNode(descText));

        const verAddCell = document.createElement('td');
        const verAddText = property.versionAdded || '';
        verAddCell.appendChild(document.createTextNode(verAddText));

        const typeCell = document.createElement('td');
        const typeText = property.type || '';
        typeCell.appendChild(document.createTextNode(typeText));

        const row = document.createElement('tr');
        row.id = `/definitions/${modelName}.${name}`
        row.appendChild(nameCell);
        row.appendChild(descCell);
        row.appendChild(verAddCell);
        row.appendChild(typeCell);

        tbody.appendChild(row);
    }

    const nameHeader = document.createElement('th');
    nameHeader.appendChild(document.createTextNode('property name'));

    const descHeader = document.createElement('th');
    descHeader.appendChild(document.createTextNode('description'));

    const verAddHeader = document.createElement('th');
    verAddHeader.appendChild(document.createTextNode('version added'));

    const typeHeader = document.createElement('th');
    typeHeader.appendChild(document.createTextNode('type'));


    const hrow = document.createElement('tr');
    hrow.appendChild(nameHeader);
    hrow.appendChild(descHeader);
    hrow.appendChild(verAddHeader);
    hrow.appendChild(typeHeader);

    const thead = document.createElement('thead');
    thead.appendChild(hrow);

    const table = document.createElement('table');
    table.classList.add('table');
    table.classList.add('is-fullwidth');
    table.classList.add('is-hoverable');
    table.appendChild(thead);
    table.appendChild(tbody);

    return table;
}

function getCurrentPosition() {
    console.log('get_current_position');
    return window.__TAURI__.invoke('get_current_position');
}

function getSchemas() {
    console.log('get_schemas');
    return window.__TAURI__.invoke('get_schemas');
}

function getSchemaByUrl(link) {
    console.log(`get_schema_by_url(${link})`);
    const args = { 'link': link };
    return window.__TAURI__.invoke('get_schema_by_url', args);
}

function getSchemaContent(schema, version) {
    console.log(`get_schema_content(${schema}, ${version})`);
    const proc = new Promise(function(resolve, reject) {
        const args = { 'schema': schema, 'version': version };
        window.__TAURI__.invoke('get_schema_content', args)
            .then(function(content) {
                resolve(JSON.parse(content));
            })
            .catch(reject);
    });
    return proc;
}

function getSchemaVersions(schema) {
    console.log(`get_schemaversions(${schema})`);
    const args = { 'schema': schema };
    return window.__TAURI__.invoke('get_schema_versions', args);
}

function highlightKeyword(keyword) {
    const content = document.querySelector('div[name="search-content"]');
    for (const data of content.querySelectorAll('td')) {
        if (data.innerHTML) {
            let target = data;
            if (data.firstChild.nodeType != Node.TEXT_NODE) {
                target = data.firstChild;
            }

            const regex = new RegExp(keyword, 'gi');
            target.innerHTML = target.innerHTML.replace(regex, '<span class="keyword">$&</span>');
        }
    }
}

function isInnerLink(atag) {
    return atag.protocol != 'http:';
}

function linkToSchema(anchor) {
    getSchemaByUrl(anchor.href)
        .then(function(model) {
            selectSchema(model.resource);
            refreshSchemaVersion().then(function() {
                selectVersion(model.version);
                const anchor = model.fragment && `#${model.fragment}`;
                refreshSchemaContent(anchor);
            });
        })
        .catch(function(e) {
            console.log(e);
            alert(e);
        });
}

function openSearchModal() {
    console.log('open search modal');
    const searchModal = document.querySelector('div[name="search"]');
    searchModal.classList.add('is-active');

    const searchKeywordInput = searchModal.querySelector('input[name="keyword"]');
    searchKeywordInput.focus();
}

function refreshSchemaContent(anchor) {
    const proc = new Promise(function(resolve, reject) {
        const schemaBox = document.querySelector('select[name="schema-name"]');
        const versionBox = document.querySelector('select[name="schema-version"]');
        getSchemaContent(schemaBox.value, versionBox.value)
            .then(function(content) {
                refreshSchemaPosition();
                refreshSchemaTable(content);
                window.location = anchor || `#/definitions/${schemaBox.value}`
                resolve();
            })
            .catch(function(e) {
                console.log(e);
                reject(e);
            });
    });
    return proc;
}

function refreshSchemaPosition() {
    getCurrentPosition().then(function(models) {
        const breadcrumb = document.querySelector('ul[name="schema-position"]');

        while (breadcrumb.firstChild) {
            breadcrumb.removeChild(breadcrumb.firstChild);
        }

        for (const model of models) {
            let anchor = createAnchor(model.resource, model.link);

            let li = document.createElement('li');
            li.appendChild(anchor);

            breadcrumb.appendChild(li);
        }
    });
}

function refreshSchemaTable(content) {
    const schemaContent = document.querySelector('div[name="schema-content"]');

    while(schemaContent.firstChild) {
        schemaContent.removeChild(schemaContent.firstChild);
    }

    for (const modelName in content.definitions) {
        const definition = content.definitions[modelName];

        const section = document.createElement('section');

        const title = document.createElement('h1');
        title.id = `/definitions/${modelName}`;
        title.classList.add('title');
        title.appendChild(document.createTextNode(modelName));
        section.appendChild(title);

        const description = document.createElement('p');
        let desc = definition.longDescrription || definition.description || '';
        description.appendChild(document.createTextNode(desc));
        section.appendChild(description);

        if (definition.properties) {
            const table = createSchemaModelTable(modelName, definition.properties);
            section.appendChild(table);
        } else if (definition.enum) {
            const table = createSchemaEnumTable(definition);
            section.appendChild(table);
        } else if (definition.anyOf) {
            for (const elem of definition.anyOf) {
                // TODO: `properties` only
                if (elem.properties) {
                    const table = createSchemaModelTable(modelName, elem.properties);
                    section.appendChild(table);
                    // TODO: first element only.
                    break;
                }
            }
        }

        schemaContent.appendChild(section);
    }
}

function refreshSchemaVersion() {
    const proc = new Promise(function(resolve, reject) {
        const schemaBox = document.querySelector('select[name="schema-name"]');
        getSchemaVersions(schemaBox.value)
            .then(function(versions) {
                const versionBox = document.querySelector('select[name="schema-version"]');

                while (versionBox.firstChild) {
                    versionBox.removeChild(versionBox.firstChild);
                }

                for (const version of versions) {
                    const v = document.createElement('option');
                    v.text = version;
                    v.value = version;
                    versionBox.appendChild(v);
                }

                resolve();
            })
            .catch(function(e) {
                console.log(e);
                reject(e);
            });
    });
    return proc;
}

function resetCurrentPosition(schema) {
    console.log(`reset_current_position(${schema})`);
    const args = { 'schema': schema };
    return window.__TAURI__.invoke('reset_current_position', args);
}

function search(keyword) {
    console.log(`search(${keyword})`);
    const args = { 'keyword': keyword };
    return window.__TAURI__.invoke('search', args);
}

function searchKeyword(keyword) {
    searchPreKeyword = keyword;
    search(keyword).then(function(resources) {
        searchTimer = null
        clearSearchContent();
        createSearchResultTable(resources);
        highlightKeyword(keyword);
    });
}

function selectSchema(schema) {
    const schemaBox = document.querySelector('select[name="schema-name"]');
    const options = schemaBox.querySelectorAll('option');
    for (const option of options) {
        if (option.value == schema) {
            option.selected = true;
        } else {
            option.selected = false;
        }
    }
}

function selectVersion(version) {
    const versionBox = document.querySelector('select[name="schema-version"]');
    const options = versionBox.querySelectorAll('option');
    for (const option of options) {
        if (option.value == version) {
            option.selected = true;
        } else {
            option.selected = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing.');

    const searchButton = document.querySelector('button[name="search"]');
    searchButton.addEventListener('click', openSearchModal);

    const searchCloseButton = document.querySelector('div[name="search"] button.delete');
    searchCloseButton.addEventListener('click', closeSearchModal);

    const searchKeywordInput = document.querySelector('div[name="search"] input[name="keyword"]');
    searchKeywordInput.addEventListener('keyup', function(e) {
        e.stopPropagation();

        let keyword = e.target.value;
        if (searchPreKeyword == keyword) {
            return;
        } else if (keyword.length < 3) {
            clearSearchContent();
            return;
        }

        if (searchTimer) {
            clearTimeout(searchTimer);
        }

        searchTimer = setTimeout(function () { searchKeyword(keyword); }, 300);
    });

    getSchemas().then(function(schemas) {
        const schemaBox = document.querySelector('select[name="schema-name"]');
        schemaBox.addEventListener('change', function(e) {
            resetCurrentPosition(e.target.value)
                .then(refreshSchemaVersion)
                .then(refreshSchemaContent);
        });

        const versionBox = document.querySelector('select[name="schema-version"]');
        versionBox.addEventListener('change', function() {
            refreshSchemaContent();
        });

        for (const schema of schemas) {
            const s = document.createElement('option');
            s.text = schema;
            s.value = schema;
            schemaBox.appendChild(s);
        }

        selectSchema('ServiceRoot');

        refreshSchemaVersion()
            .then(refreshSchemaContent)
            .then(function() {
                console.log('Initialized.');
            });
    });
});
