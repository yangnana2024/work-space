import DOMPurify from 'dompurify'
import { marked } from 'marked'
import changelogMarkdown from '../CHANGELOG.md?raw'

export const appVersion = __APP_VERSION__

const latestReleaseHeading = marked.lexer(changelogMarkdown).find(
	(token) => token.type === 'heading' && token.depth === 2,
)
const releaseDate = latestReleaseHeading?.text.match(/\[[^\]]+\]\s*-\s*(\d{4}-\d{2}-\d{2})$/)?.[1]

export const appReleaseDate = releaseDate ?? ''
export const changelogHtml = DOMPurify.sanitize(
	marked.parse(changelogMarkdown, { async: false }),
)
