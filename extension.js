// copied and adapted from https://github.com/dvargas92495/roamjs-components/blob/main/src/writes/createBlock.ts
const createBlock = (params) => {
    const uid = window.roamAlphaAPI.util.generateUID();
    return Promise.all([
        window.roamAlphaAPI.createBlock({
            location: {
                "parent-uid": params.parentUid,
                order: params.order,
            },
            block: {
                uid,
                string: params.node.text
            }
        })
    ].concat((params.node.children || []).map((node, order) =>
        createBlock({ parentUid: uid, order, node })
    )))
};

// copied and adapted from https://github.com/dvargas92495/roamjs-components/blob/main/src/components/FormDialog.tsx
const FormDialog = ({
    onSubmit,
    title,
    options,
    question,
    onClose,
}) => {
    const [data, setData] = window.React.useState(options[0].id);
    const onClick = window.React.useCallback(
        () => {
            onSubmit(data);
            onClose();
        },
        [data, onClose]
    );
    const onCancel = window.React.useCallback(
        () => {
            onSubmit("");
            onClose();
        },
        [onClose]
    )
    return window.React.createElement(
        window.Blueprint.Core.Dialog,
        { isOpen: true, onClose: onCancel, title, },
        window.React.createElement(
            "div",
            { className: window.Blueprint.Core.Classes.DIALOG_BODY },
            question,
            window.React.createElement(
                window.Blueprint.Core.Label,
                {},
                "Books:",
                window.React.createElement(
                    window.Blueprint.Select.Select,
                    {
                        activeItem: data,
                        onItemSelect: (id) => setData(id),
                        items: options.map(opt => opt.id),
                        itemRenderer: (item, { modifiers, handleClick }) => window.React.createElement(
                            window.Blueprint.Core.MenuItem,
                            {
                                key: item,
                                text: options.find(opt => opt.id === item).label,
                                active: modifiers.active,
                                onClick: handleClick,
                            }
                        ),
                        filterable: false,
                        popoverProps: {
                            minimal: true,
                            captureDismiss: true,
                        }
                    },
                    window.React.createElement(
                        window.Blueprint.Core.Button,
                        {
                            text: options.find(opt => opt.id === data).label,
                            rightIcon: "double-caret-vertical"
                        }
                    )
                )
            )
        ),
        window.React.createElement(
            "div",
            { className: window.Blueprint.Core.Classes.DIALOG_FOOTER },
            window.React.createElement(
                "div",
                { className: window.Blueprint.Core.Classes.DIALOG_FOOTER_ACTIONS },
                window.React.createElement(
                    window.Blueprint.Core.Button,
                    { text: "Cancel", onClick: onCancel, }
                ),
                window.React.createElement(
                    window.Blueprint.Core.Button,
                    { text: "Submit", intent: "primary", onClick }
                )
            )
        )
    );
}

const prompt = ({
    options,
    question,
    title,
}) =>
    new Promise((resolve) => {
        const app = document.getElementById("app");
        const parent = document.createElement("div");
        parent.id = 'imdb-prompt-root';
        app.parentElement.appendChild(parent);

        window.ReactDOM.render(
            window.React.createElement(
                FormDialog,
                {
                    onSubmit: resolve,
                    title,
                    options,
                    question,
                    onClose: () => {
                        window.ReactDOM.unmountComponentAtNode(parent);
                        parent.remove();
                    }
                }
            ),
            parent
        )
    });

var pageTitle, result;

export default {
    onload: ({ extensionAPI }) => {
        window.roamAlphaAPI.ui.commandPalette.addCommand({
            label: "Open Library import",
            callback: () => {
                const uid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
                fetchOL(uid).then(async (blocks) => {
                    if (uid != undefined) {
                        const pageId = window.roamAlphaAPI.pull("[*]", [":block/uid", uid])?.[":block/page"]?.[":db/id"];
                        const parentUid = window.roamAlphaAPI.pull("[:block/uid]", pageId)?.[":block/uid"];
                        blocks.forEach((node, order) => createBlock({
                            parentUid,
                            order,
                            node
                        }));
                    } else {
                        const parentUid = await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
                        blocks.forEach((node, order) => createBlock({
                            parentUid,
                            order,
                            node
                        }))
                    }
                });
            },
        });

        const args = {
            text: "OPENLIBRARY",
            help: "Import book data from the Open Library",
            handler: (context) => fetchOL,
        };

        if (window.roamjs?.extension?.smartblocks) {
            window.roamjs.extension.smartblocks.registerCommand(args);
        } else {
            document.body.addEventListener(
                `roamjs:smartblocks:loaded`,
                () =>
                    window.roamjs?.extension.smartblocks &&
                    window.roamjs.extension.smartblocks.registerCommand(args)
            );
        }

        async function fetchOL(uid) {
            const pageId = window.roamAlphaAPI.pull("[*]", [":block/uid", uid])?.[":block/page"]?.[":db/id"];
            pageTitle = pageId
                ? window.roamAlphaAPI.pull("[:node/title]", pageId)?.[":node/title"]
                : window.roamAlphaAPI.pull("[:node/title]", [
                    ":block/uid",
                    await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid()
                ])?.[":node/title"];
            const regex = /(\/)/g;
            const subst = `%2F`;
            result = pageTitle.replace(regex, subst);
            var url = "https://openlibrary.org/search.json?title=" + result + "";

            return fetch(url).then(r => r.json()).then((books) => {
                const options = books.docs
                    .map(b => ({ label: "" + b.title + " (" + b.author_name + " - " + b.first_publish_year + ")", id: b.key }));
                return prompt({
                    title: "Open Library",
                    question: "Which book do you mean?",
                    options,
                });
            }).then((bookId) => {
                var worksUrl = "https://openlibrary.org" + bookId + ".json";
                var searchUrl = "https://openlibrary.org/search.json?title=" + result + "";

                return !bookId ? [{ text: "No book selected!" }] : (() => {
                    const getSearchDataAgain = new Promise((resolve) => {
                        fetch(searchUrl).then(r => r.json()).then((books) => {
                            var firstYear, pages, authors, cover;
                            for (var i = 0; i < books.docs.length; i++) {
                                if (books.docs[i].key == bookId) {
                                    if (books.docs[i].hasOwnProperty("first_publish_year")) {
                                        firstYear = "" + books.docs[i].first_publish_year + "";
                                    }
                                    if (books.docs[i].hasOwnProperty("number_of_pages_median")) {
                                        pages = "" + books.docs[i].number_of_pages_median + "";
                                    }
                                    if (books.docs[i].hasOwnProperty("author_name")) {
                                        authors = "" + books.docs[i].author_name + "";
                                    }
                                    if (books.docs[i].hasOwnProperty("cover_edition_key")) {
                                        cover = "" + books.docs[i].cover_edition_key + "";
                                    }
                                    var booksResults = { firstYear, pages, authors, cover };
                                    resolve(booksResults);
                                }
                            }
                        });
                    });
                    const getBook = new Promise((resolve) => {
                        fetch(worksUrl).then(r => r.json()).then((book) => {
                            var subtitle, description, subjects, title;
                            if (book.hasOwnProperty("subjects")) {
                                subjects = book.subjects;
                            }
                            if (book.hasOwnProperty("title")) {
                                title = book.title;
                            }
                            if (book.hasOwnProperty("subtitle")) {
                                subtitle = book.subtitle;
                            }
                            if (book.hasOwnProperty("description")) {
                                if (book.description.hasOwnProperty("value")) {
                                    description = book.description.value;
                                }
                                else {
                                    description = book.description;
                                }
                            }
                            var bookResults = { title, subtitle, subjects, description };
                            resolve(bookResults);
                        });
                    });

                    return Promise.allSettled([getSearchDataAgain, getBook])
                        .then(async results => {
                            let finalResults = [];
                            let metadataResults = [];
                            if (results[0].value.cover != undefined) {
                                finalResults.push({ text: "![](https://covers.openlibrary.org/b/olid/" + results[0].value.cover + "-M.jpg)" });
                            }
                            if (results[1].value.title != undefined) {
                                metadataResults.push({ text: "Title:: [[" + results[1].value.title + "]]" })
                            }
                            if (results[1].value.subtitle != undefined) {
                                metadataResults.push({ text: "Subtitle:: [[" + results[1].value.subtitle + "]]" })
                            }
                            if (results[0].value.authors != undefined) {
                                let authorList = results[0].value.authors.split(",");
                                var authorsString = "[[" + authorList[0] + "";
                                if (authorList.length > 1) {
                                    for (var i = 1; i < authorList.length; i++) {
                                        authorsString += "]] [[" + authorList[i] + ""
                                    }
                                }
                                authorsString += "]]";
                                metadataResults.push({ text: "Authors:: " + authorsString + "" })
                            }
                            if (results[0].value.firstYear != undefined) {
                                metadataResults.push({ text: "Year:: " + results[0].value.firstYear + "" })
                            }
                            if (results[1].value.subjects != undefined && results[1].value.subjects.length > 0) {
                                var subjectsString = "[[" + results[1].value.subjects[0] + "";
                                if (results[1].value.subjects.length > 1) {
                                    for (var i = 1; i < results[1].value.subjects.length; i++) {
                                        subjectsString += "]] [[" + results[1].value.subjects[i] + ""
                                    }
                                }
                                subjectsString += "]]";
                                metadataResults.push({ text: "Subjects:: " + subjectsString + "" })
                            }
                            if (results[0].value.pages != undefined) {
                                metadataResults.push({ text: "Pages:: " + results[0].value.pages + "" })
                            }
                            finalResults.push({ text: "**Metadata:**", children: metadataResults });

                            if (results[1].value.description != undefined) {
                                let descString = results[1].value.description.split("----------");
                                finalResults.push({ text: "Description:: " + descString[0].trim() + "" });
                            }
                            finalResults.push({ text: "---" });
                            return finalResults;
                        }
                        );
                })();
            })
        };
    },
    onunload: () => {
        window.roamAlphaAPI.ui.commandPalette.removeCommand({
            label: 'Open Library import'
        });
        if (window.roamjs?.extension?.smartblocks) {
            window.roamjs.extension.smartblocks.unregisterCommand("OPENLIBRARY");
        };
    }
}