import { test, expect } from '@playwright/test'
test('三维可见体素悬停、颜色、离开隐藏与剖切截面',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.getByRole('button',{name:'开始挑战',exact:true}).click();await page.getByRole('button',{name:'3D 体素创作',exact:true}).click();await page.getByRole('button',{name:/立方体.*载入示例/}).click();await page.getByRole('button',{name:'运行',exact:true}).click();await expect(page.getByLabel('三维体素画布',{exact:true})).toHaveAttribute('data-voxels','343');
 for(const name of ['三维参考图画布','三维体素画布']){
 const canvas=page.getByLabel(name,{exact:true}),box=(await canvas.boundingBox())!;const [yaw,pitch,zoom]=(await canvas.getAttribute('data-view'))!.split(',').map(Number);const scale=Math.min(box.width,box.height)/34.2*zoom;
 const hover=async(x:number,y:number,z:number)=>{const a=Math.cos(yaw)*x+Math.sin(yaw)*z,b=-Math.sin(yaw)*x+Math.cos(yaw)*z;await page.mouse.move(box.x+box.width/2+a*scale,box.y+box.height/2-(Math.cos(pitch)*y-Math.sin(pitch)*b)*scale)};
 await hover(1,1,3.5);await expect(page.getByRole('tooltip')).toContainText('x: 1, y: 1, z: 3');await expect(page.getByRole('tooltip')).toContainText('橙');await expect(page.getByRole('tooltip').locator('.coordinate-swatch')).toHaveCSS('background-color','rgb(249, 115, 22)');
 await page.mouse.move(box.x+5,box.y+5);await expect(page.getByRole('tooltip')).toHaveCount(0);
 }
 const handle=page.getByRole('slider',{name:'X 轴剖切'}).first();await handle.focus();for(let i=0;i<8;i++)await page.keyboard.press('ArrowLeft');
 const canvas=page.getByLabel('三维参考图画布'),box=(await canvas.boundingBox())!;const scale=Math.min(box.width,box.height)/34.2;const yaw=-.65,pitch=.45,x=.5,y=-2,z=2,a=Math.cos(yaw)*x+Math.sin(yaw)*z,b=-Math.sin(yaw)*x+Math.cos(yaw)*z;await page.mouse.move(box.x+box.width/2+a*scale,box.y+box.height/2-(Math.cos(pitch)*y-Math.sin(pitch)*b)*scale);await expect(page.getByRole('tooltip')).toContainText('x: 0, y: -2, z: 2');await page.screenshot({path:'test-results/voxel-hover.png'});
 await canvas.focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tooltip')).toHaveCount(0);
})
