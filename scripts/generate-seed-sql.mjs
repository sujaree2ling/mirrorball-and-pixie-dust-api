/**
 * Regenerates supabase/seed.sql from the frontend blogPosts source.
 * Expects sibling repos under the same parent folder:
 *   ../mirrorball-and-pixie-dust/src/data/blogPosts.js
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { blogPosts } from '../../mirrorball-and-pixie-dust/src/data/blogPosts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function escapeSql(value) {
  return String(value).replaceAll("'", "''")
}

function parseDisplayDate(displayDate) {
  const parsed = new Date(displayDate)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${displayDate}`)
  }
  return parsed.toISOString().slice(0, 10)
}

const values = blogPosts
  .map((post) => {
    const date = parseDisplayDate(post.date)
    return `(
  ${post.id},
  '${escapeSql(post.title)}',
  '${escapeSql(post.description)}',
  '${escapeSql(post.content)}',
  '${escapeSql(post.category)}',
  '${escapeSql(post.image)}',
  '${escapeSql(post.imagePosition ?? 'center')}',
  '${escapeSql(post.author)}',
  '${date}',
  ${post.likes ?? 0},
  'published'
)`
  })
  .join(',\n')

const sql = `-- Generated from mirrorball-and-pixie-dust/src/data/blogPosts.js
-- Run in Supabase Dashboard → SQL Editor (after schema.sql)

truncate table public.posts restart identity cascade;

insert into public.posts (
  id,
  title,
  description,
  content,
  category,
  image,
  image_position,
  author,
  date,
  likes,
  status
) values
${values};
`

const outPath = path.join(__dirname, '../supabase/seed.sql')
writeFileSync(outPath, sql, 'utf8')
console.log(`Wrote ${blogPosts.length} posts to ${outPath}`)
