import { test, expect } from '@playwright/test'
import { parseProgress } from '../src/hooks/useProgress'
import { voxelReference } from '../src/engine/voxel'
import { evaluate } from '../src/engine/evaluate'
test('三维判定严格检查内部、多画、漏画和错色；旧存档兼容',()=>{
 const target=voxelReference(0)
 for(const [index,value] of [[0,1],[2456,0],[2456,5]]){const result=[...target];result[index]=value;expect(evaluate(target,result).passed).toBe(false)}
 expect(evaluate(target,target).passed).toBe(true)
 const old={schemaVersion:1,codes:{},passed:{square:true},levelId:'square',introSeen:true,voxelCode:'old code'}
 expect(parseProgress(JSON.stringify(old))).toMatchObject({voxelCode:'old code',passed:{square:true},voxelPassed:{}})
 expect(()=>parseProgress(JSON.stringify({...old,voxelPassed:{'voxel-cube':'yes'}}))).toThrow()
})
test('三维成绩、剖切无关、独立通关、失败保留、刷新恢复',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write'])
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.getByRole('button',{name:'开始挑战',exact:true}).click();await page.getByRole('button',{name:'3D 体素创作',exact:true}).click()
 const run=page.getByRole('button',{name:'运行',exact:true}),score=page.getByTestId('voxel-score')
 const write=async(code:string)=>{await page.evaluate(s=>navigator.clipboard.writeText(s),code);await page.locator('.code-editor').click({position:{x:160,y:50}});await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press('ControlOrMeta+V')}
 await expect(run).toBeEnabled();await run.click();await expect(score).toContainText('0.0%')
 await page.getByRole('button',{name:/立方体.*载入示例/}).click();await run.click();await expect(score).toContainText('100.0%');await expect(page.getByRole('button',{name:/立方体.*已通关/})).toBeVisible()
 const cut=page.getByRole('slider',{name:'X 轴剖切'}).first();await cut.focus();await page.keyboard.press('Home');await run.click();await expect(score).toContainText('100.0%')
 await write('def voxel(x,y,z):\n    return 0');await run.click();await expect(score).toContainText('0.0%');await expect(page.getByRole('button',{name:/立方体.*已通关/})).toBeVisible()
 await write('def voxel(x,y,z):\n    return 1/0');await run.click();await expect(page.locator('.error[role=alert]')).toContainText('ZeroDivisionError');await expect(score).toContainText('历史匹配率')
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:/球体.*载入示例/}).click();await expect(score).toHaveCount(0);await run.click();await expect(score).toContainText('100.0%');await expect(page.getByRole('button',{name:/球体.*已通关/})).toBeVisible()
 await page.getByRole('button',{name:'恢复完整模型'}).click();await page.screenshot({path:'test-results/voxel-scored.png'})
 await page.reload();await expect(score).toHaveCount(0);await expect(page.getByRole('button',{name:/立方体.*已通关/})).toBeVisible();await expect(page.getByRole('button',{name:/球体.*已通关/})).toBeVisible();await expect(page.getByRole('button',{name:/彩色阶梯.*已通关/})).toHaveCount(0)
 await page.getByRole('button',{name:'2D 像素挑战',exact:true}).click();await expect(page.getByRole('button',{name:/实心正方形.*已通关/})).toHaveCount(0)
})
