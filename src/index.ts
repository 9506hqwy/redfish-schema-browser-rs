import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import './bulma.min.css';
import './index.css';

var searchPreKeyword: (string | null) = null;
var searchTimer: (number | null) = null;

function clearSearchContent() {
    const content = document.querySelector<HTMLDivElement>('div[name="search-content"]')!;

    while(content.firstChild) {
        content.removeChild(content.firstChild);
    }
}

function closeSearchModal() {
    console.log('close search modal');
    const searchModal = document.querySelector<HTMLDivElement>('div[name="search"]')!;
    searchModal.classList.remove('is-active');
}

function createAnchor(text: string, href: string): HTMLAnchorElement {
    let anchor = document.createElement('a');
    anchor.href = href;
    anchor.title = href;
    anchor.appendChild(document.createTextNode(text));

    if (!isInnerLink(anchor)) {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            linkToSchema(e.target as HTMLAnchorElement);
        });
    }

    return anchor;
}

function createSearchResultTable(resources: any[]) {
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

    const content = document.querySelector<HTMLDivElement>('div[name="search-content"]')!;
    content.appendChild(table);
}

function createSchemaEnumTable(definition: any): HTMLTableElement {
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

function createSchemaModelTable(modelName: string, properties: any): HTMLTableElement {
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

function getCurrentPosition(): Promise<unknown> {
    console.log('get_current_position');
    return invoke('get_current_position');
}

function getSchemas(): Promise<string[]> {
    console.log('get_schemas');
    return invoke('get_schemas');
}

function getSchemaByUrl(link: string): Promise<unknown> {
    console.log(`get_schema_by_url(${link})`);
    const args = { 'link': link };
    return invoke('get_schema_by_url', args);
}

async function getSchemaContent(schema: string, version: string): Promise<unknown> {
    console.log(`get_schema_content(${schema}, ${version})`);
    const args = { 'schema': schema, 'version': version };
    const content = await invoke('get_schema_content', args);
    return JSON.parse(content as string);
}

function getSchemaVersions(schema: string): Promise<string[]> {
    console.log(`get_schemaversions(${schema})`);
    const args = { 'schema': schema };
    return invoke('get_schema_versions', args);
}

function highlightKeyword(content: HTMLElement, keyword: string) {
    for (const data of content.querySelectorAll<HTMLTableCellElement>('td')!) {
        if (data.innerHTML) {
            let target = data as HTMLElement;
            if (data.firstChild!.nodeType != Node.TEXT_NODE) {
                target = data.firstChild! as HTMLElement;
            }

            const regex = new RegExp(keyword, 'gi');
            target.innerHTML = target.innerHTML.replace(regex, '<span class="keyword">$&</span>');
        }
    }
}

function isInnerLink(atag: HTMLAnchorElement): boolean {
    return atag.hostname == 'localhost';
}

async function linkToSchema(anchor: HTMLAnchorElement): Promise<void> {
    const model = await getSchemaByUrl(anchor.href) as any;
    selectSchema(model.resource);

    await refreshSchemaVersion();
    selectVersion(model.version);

    const flag = model.fragment && `#${model.fragment}`;
    await refreshSchemaContent(flag);
}

async function openDirectorySelector(): Promise<void> {
    const args = {
        directory: true,
        title: 'Select json schema directory'
    };
    const path = await open(args);

    await setSchemaPath(path as string);

    const schemas = await getSchemas();

    await setUpSchemas(schemas);
}

function openSearchModal() {
    console.log('open search modal');
    const searchModal = document.querySelector<HTMLDivElement>('div[name="search"]')!;
    searchModal.classList.add('is-active');

    const searchKeywordInput = searchModal.querySelector<HTMLInputElement>('input[name="keyword"]')!;
    searchKeywordInput.focus();
}

async function refreshSchemaContent(anchor?: string): Promise<unknown> {
    const schemaBox = document.querySelector<HTMLSelectElement>('select[name="schema-name"]')!;
    const versionBox = document.querySelector<HTMLSelectElement>('select[name="schema-version"]')!;
    const content = await getSchemaContent(schemaBox.value, versionBox.value);
    await refreshSchemaPosition();
    refreshSchemaTable(content);
    window.location.href = anchor || `#/definitions/${schemaBox.value}`

    if (searchPreKeyword) {
        const content = document.querySelector<HTMLDivElement>('div[name="schema-content"]')!;
        highlightKeyword(content, searchPreKeyword);
    }

    return content;
}

async function refreshSchemaPosition(): Promise<void> {
    const models = await getCurrentPosition() as any;
    const breadcrumb = document.querySelector<HTMLUListElement>('ul[name="schema-position"]')!;

    while (breadcrumb.firstChild) {
        breadcrumb.removeChild(breadcrumb.firstChild);
    }

    for (const model of models) {
        let anchor = createAnchor(model.resource, model.link);

        let li = document.createElement('li');
        li.appendChild(anchor);

        breadcrumb.appendChild(li);
    }
}

function refreshSchemaTable(content: any) {
    const schemaContent = document.querySelector<HTMLDivElement>('div[name="schema-content"]')!;

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

async function refreshSchemaVersion(): Promise<void> {
    const schemaBox = document.querySelector<HTMLSelectElement>('select[name="schema-name"]')!;
    const versions = await getSchemaVersions(schemaBox.value);
    const versionBox = document.querySelector<HTMLSelectElement>('select[name="schema-version"]')!;

    while (versionBox.firstChild) {
        versionBox.removeChild(versionBox.firstChild);
    }

    for (const version of versions) {
        const v = document.createElement('option');
        v.text = version;
        v.value = version;
        versionBox.appendChild(v);
    }
}

function resetCurrentPosition(schema: string) {
    console.log(`reset_current_position(${schema})`);
    const args = { 'schema': schema };
    return invoke('reset_current_position', args);
}

function search(keyword: string): Promise<unknown[]> {
    console.log(`search(${keyword})`);
    const args = { 'keyword': keyword };
    return invoke('search', args);
}

async function searchKeyword(keyword: string): Promise<void> {
    searchPreKeyword = keyword;
    let resources = await search(keyword);
    searchTimer = null
    clearSearchContent();
    createSearchResultTable(resources);

    const content = document.querySelector<HTMLDivElement>('div[name="search-content"]')!;
    highlightKeyword(content, keyword);
}

function selectSchema(schema: string) {
    const schemaBox = document.querySelector<HTMLSelectElement>('select[name="schema-name"]')!;
    const options = schemaBox.querySelectorAll<HTMLOptionElement>('option')!;
    for (const option of options) {
        if (option.value == schema) {
            option.selected = true;
        } else {
            option.selected = false;
        }
    }
}

function selectVersion(version: string) {
    const versionBox = document.querySelector<HTMLSelectElement>('select[name="schema-version"]')!;
    const options = versionBox.querySelectorAll<HTMLOptionElement>('option')!;
    for (const option of options) {
        if (option.value == version) {
            option.selected = true;
        } else {
            option.selected = false;
        }
    }
}

function setSchemaPath(path: string) {
    console.log(`set_schema_path(${path})`);
    const args = { 'path': path };
    return invoke('set_schema_path', args);
}

async function setUpSchemas(schemas: string[]): Promise<void> {
    const schemaBox = document.querySelector<HTMLSelectElement>('select[name="schema-name"]')!;

    for (const schema of schemas) {
        const s = document.createElement('option');
        s.text = schema;
        s.value = schema;
        schemaBox.appendChild(s);
    }

    selectSchema('ServiceRoot');

    await refreshSchemaVersion();
    await refreshSchemaContent();
    console.log('Initialized.');
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing.');

    const searchButton = document.querySelector<HTMLButtonElement>('button[name="search"]')!;
    searchButton.addEventListener('click', openSearchModal);

    const searchCloseButton = document.querySelector<HTMLDivElement>('div[name="search"] button.delete')!;
    searchCloseButton.addEventListener('click', closeSearchModal);

    const searchKeywordInput = document.querySelector<HTMLInputElement>('div[name="search"] input[name="keyword"]')!;
    searchKeywordInput.addEventListener('keyup', function(e) {
        e.stopPropagation();

        let keyword = (e.target as HTMLInputElement)!.value;
        if (searchPreKeyword == keyword) {
            return;
        } else if (keyword.length < 3) {
            searchPreKeyword = null;
            clearSearchContent();
            return;
        }

        if (searchTimer) {
            clearTimeout(searchTimer);
        }

        searchTimer = setTimeout(function () { searchKeyword(keyword); }, 300);
    });

    getSchemas().then(function(schemas: string[]) {
        const schemaBox = document.querySelector<HTMLSelectElement>('select[name="schema-name"]')!;
        schemaBox.addEventListener('change', function(e) {
            resetCurrentPosition((e.target as HTMLSelectElement)!.value)
                .then(refreshSchemaVersion)
                .then(_ => refreshSchemaContent());
        });

        const versionBox = document.querySelector<HTMLSelectElement>('select[name="schema-version"]')!;
        versionBox.addEventListener('change', function() {
            refreshSchemaContent();
        });

        if (schemas.length > 0) {
            setUpSchemas(schemas);
            return;
        }

        const selectDirectory = document.querySelector<HTMLInputElement>('input[name="schema-select"]')!;
        selectDirectory.addEventListener('click', function(e) {
            e.preventDefault();

            openDirectorySelector();
        });

        console.log('Pending.');
    });
});
