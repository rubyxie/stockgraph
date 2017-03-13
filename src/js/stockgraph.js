/*
 * created by bigbird on 2017/2/26
 */
(function(){
	var KPainter,requestDispatcher,pageControl,Config,StockGraph;
	//避免marketDetail请求过大而设置的本地变量
	Config={
		SS:{
			trade_section_grp:[{open_time:930,close_time:1130},{open_time:1300,close_time:1500}]
		},
		SZ:{
			trade_section_grp:[{open_time:930,close_time:1130},{open_time:1300,close_time:1500}]
		},
		HKM:{
			trade_section_grp:[{open_time:930,close_time:1200},{open_time:1300,close_time:1600}]
		}
	};
	/*
	 * K线绘图器。本身作为总控制器，内部有多个绘图器
	 */
	KPainter=(function(){
		//dom元素
		var container,realCanvas,cacheCanvas,realContext,cacheContext,pixel,
			realCursorCanvas,cacheCursorCanvas,realCursorContext,cacheCursorContext;
		//配置变量
		var rawData,process,speed,totalTime,painterStack,kColor,kWidth,gapWidth,
			fontSize,maColor,gapOccupy,dayCount,loading,cursorIndex,cursorX;
		//方法&对象
		var init,draw,resize,refreshCache,candlePainter,kBarPainter,trendBarPainter,
			kControl,trendControl,refreshCursorCache,trendPainter,initDom,initCanvas,
			animate,painterTool,eventControl,currControl,triggerControl,showLoading;

		//初始化dom元素，仅需执行一次
		initDom=function(){
			//pixel=window.devicePixelRatio;
			pixel=2;
			//固定配置项
			painterStack=[];
			//[跌，涨]
			kColor=["#32a647","#fa5d5d"];
			//MA图线颜色
			maColor={5:"#f5a623",10:"#2e84e6",20:"#bd10e0"};
			//ma指标
			dayCount=[5,10,20];
			//柱图间隙占比
			gapOccupy=0.4;
			//文字大小
			fontSize=24;
			//线性动画下动画总时长
			totalTime=800;
			//线性动画下递增速度（渐变动画时无效）
			speed=16/totalTime;
			//递增标志
			process=speed;
			//dom
			container=document.getElementById("k-container");
			realCanvas=container.realCanvas || document.createElement("canvas");
			cacheCanvas=container.cacheCanvas || document.createElement("canvas");
			realContext=realCanvas.getContext("2d");
			cacheContext=cacheCanvas.getContext("2d");
			realCanvas.style.position="absolute";
			container.appendChild(realCanvas);
			//十字光标画布
			realCursorCanvas=container.realCursorCanvas || document.createElement("canvas");
			cacheCursorCanvas=container.cacheCursorCanvas || document.createElement("canvas");
			realCursorContext=realCursorCanvas.getContext("2d");
			cacheCursorContext=cacheCursorCanvas.getContext("2d");
			realCursorCanvas.style.position="absolute";
			container.appendChild(realCursorCanvas);
		};
		initDom();
		
		//初始化画布长宽，在页面resize时需要重新执行
		initCanvas=function(){
			//避免移动设备screenPixel模糊问题
			cacheCanvas.width=container.clientWidth*pixel;
			cacheCanvas.height=container.clientHeight*pixel;
			realCanvas.width=container.clientWidth*pixel;
			realCanvas.height=container.clientHeight*pixel;
			realCanvas.style.width=container.clientWidth+"px";
			realCanvas.style.height=container.clientHeight+"px";
			//十字光标画布
			cacheCursorCanvas.width=container.clientWidth*pixel;
			cacheCursorCanvas.height=container.clientHeight*pixel;
			realCursorCanvas.width=container.clientWidth*pixel;
			realCursorCanvas.height=container.clientHeight*pixel;
			realCursorCanvas.style.width=container.clientWidth+"px";
			realCursorCanvas.style.height=container.clientHeight+"px";
		};

		/*------------------------工具方法---------------------------*/
		painterTool={
			//传入两个坐标点对象，绘制连接这两个点的虚线
			drawDashed:function(start,end){
				var gap=0.004,length=0.006,position=0,x,y,
					gapX,gapY,lengthX,lengthY,step;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#ccc";
				cacheContext.lineWidth=2;
				gapX=(end.x-start.x)*gap;
				gapY=(end.y-start.y)*gap;
				lengthX=(end.x-start.x)*length;
				lengthY=(end.y-start.y)*length;
				step=gap+length;
				x=start.x;
				y=start.y;
				cacheContext.moveTo(x,y);
				for(;position+length<1;position+=step){
					x+=lengthX;
					y+=lengthY;
					cacheContext.lineTo(x,y);
					x+=gapX;
					y+=gapY;
					cacheContext.moveTo(x,y);
				}
				cacheContext.lineTo(end.x,end.y);
				cacheContext.stroke();
			},
			//数字为参数，返回奇数
			getOdd:function(value,add){
				var result;
				if(add){
					result=value%2==0 ? value-1:value;
				}else{
					result=value%2==0 ? value-1:value;
				}
				return result;
			}
		};
		/*------------------------工具方法end---------------------------*/

		/*------------------------绘图器---------------------------*/
		/*
		 * K线蜡烛绘图器，子绘图器操作在缓冲画布中，不影响显示
		 */
		candlePainter=(function(){
			//配置变量
			var data,layout,width,height,leftX,rightX,topY,bottomY,
				max,min,candleY,candleX,amount,range,middleX,
				middleY,start,end;
			//方法
			var initSize,drawReady,resizeDraw,initValue,drawGrid,handleData,
				drawFrame,drawUpCandle,drawDownCandle,calcAxis,insideOf,drawMA,
				drawMAText,showCursor,drawCursor,drawXTip,drawYTip;

			//为固定配置变量赋值
			layout={a:0.01,b:0.01,c:0.3,d:0.01};

			//设置布局属性，画布长宽会在resize时重新计算
			initValue=function(){
				leftX=painterTool.getOdd(realCanvas.width*layout.d,false);
				rightX=painterTool.getOdd(realCanvas.width*(1-layout.b),true);
				topY=painterTool.getOdd(realCanvas.height*layout.a,false);
				bottomY=painterTool.getOdd(realCanvas.height*(1-layout.c),true);
				width=rightX-leftX;
				height=bottomY-topY;
			};

			//计算y坐标值
			calcAxis=function(){
				var i,j,k;
				for(i=start;i<end;i++){
					//蜡烛坐标计算，[开盘价，最高价，最低价，收盘价，中点]y坐标
					data[i].axis=[];
					for(j=1;j<5;j++){
						data[i].axis.push(topY+height*(max-data[i][j])/range);
					}
					data[i].axis.push((data[i].axis[3]+data[i].axis[0])/2);
					for(k in data.maData){
						data.maData[k][i].maAxis=topY+height*(max-data.maData[k][i][0])/range;
					}
				}
			};

			/*
			 * 为可变配置赋值
			 * 计算数据展示总数
			 * 计算蜡烛宽度、间距宽度
			 * 计算y坐标轴的最大值，最小值
			 * 计算每个数据的颜色标记：1-涨，0-跌
			 */
			handleData=function(){
				var i,j,temp;
				amount=end-start;
				kWidth=width*(1-gapOccupy)/amount;
				gapWidth=width*gapOccupy/(amount+1);
				//处理ma头尾补图形引起的作用于变化问题
				max=data[start][2];
				min=data[start][3];
				for(i=start;i<end;i++){
					if(max<data[i][2]){
						max=data[i][2];
					}
					for(j in data.maData){
						if(max<data.maData[j][i][0]){
							max=data.maData[j][i][0];
						}
					}
					if(min>data[i][3]){
						min=data[i][3];
					}
					for(j in data.maData){
						if(min>data.maData[j][i][0]){
							min=data.maData[j][i][0];
						}
					}
				}
				//和头尾的均线值比较
				if(start>0){
					temp=start-1;
					for(j in data.maData){
						if(max<data.maData[j][temp][0]){
							max=data.maData[j][temp][0];
						}
					}
					for(j in data.maData){
						if(min>data.maData[j][temp][0]){
							min=data.maData[j][temp][0];
						}
					}
				}
				if(end<data.length){
					temp=end+1;
					for(j in data.maData){
						if(max<data.maData[j][temp][0]){
							max=data.maData[j][temp][0];
						}
					}
					for(j in data.maData){
						if(min>data.maData[j][temp][0]){
							min=data.maData[j][temp][0];
						}
					}
				}
				range=max-min;
				calcAxis();
			};

			//绘制蜡烛图ma文字
			drawMAText=function(index){
				var maTips,i,wordWidth,word,gapWidth,wordX,count;
				count=0;
				wordWidth=0;
				maTips={};
				for(i in data.maData){
					word=data.maData[i][index][0]=="-" ? "-":(data.maData[i][index][0].toFixed(2));
					word="MA"+i+"："+word;
					maTips[i]=word;
					wordWidth+=cacheContext.measureText(word).width;
					count++;
				}
				gapWidth=(width-wordWidth)/(count+1);
				cacheContext.font=fontSize+"px Arial";
				cacheContext.textBaseline="top";
				cacheContext.textAlign="left";
				wordX=leftX+gapWidth;
				wordWidth/=count;
				for(i in data.maData){
					cacheContext.fillStyle=maColor[i];
					cacheContext.fillText(maTips[i],wordX,topY);
					wordX+=wordWidth+gapWidth;
				}
			};
			
			//绘制坐标轴网格
			drawGrid=function(){
				var stepY;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#000";
				cacheContext.lineWidth=1;
				//绘制实线
				cacheContext.moveTo(leftX,topY);
				cacheContext.lineTo(rightX,topY);
				cacheContext.lineTo(rightX,bottomY);
				cacheContext.lineTo(leftX,bottomY);
				cacheContext.closePath();
				cacheContext.stroke();
				//绘制虚线
				stepY=height/4;
				for(var i=1;i<4;i++){
					painterTool.drawDashed({x:painterTool.getOdd(leftX),y:painterTool.getOdd(topY+i*stepY)},{x:painterTool.getOdd(rightX),y:painterTool.getOdd(topY+i*stepY)});
				}
				//绘制y轴数字
				cacheContext.fillStyle="#999";
				cacheContext.font=fontSize+"px Arial";
				cacheContext.textAlign="left";
				cacheContext.textBaseline="top";
				cacheContext.fillText(max.toFixed(2),leftX,topY);
				cacheContext.textBaseline="middle";
				cacheContext.fillText(((max+min)/2).toFixed(2),leftX,topY+height/2);
				cacheContext.textBaseline="bottom";
				cacheContext.fillText(min.toFixed(2),leftX,bottomY);
				//绘制x轴日期
				cacheContext.textBaseline="top";
				cacheContext.fillText(data[start][0],leftX,bottomY);
				cacheContext.textAlign="right";
				cacheContext.fillText(data[end-1][0],rightX,bottomY);
				drawMAText(end-1);
			};

			/*
			 * 红色K线，从下往上画
			 * 传入蜡烛左侧x坐标和K线数据[日期，开盘价，最高价，最低价，收盘价，成交量]为参数
			 */
			drawUpCandle=function(x,value){
				middleX=painterTool.getOdd(x+kWidth/2);
				middleY=value.axis[4];
				cacheContext.beginPath();
				cacheContext.fillStyle=kColor[value.color];
				cacheContext.strokeStyle=kColor[value.color];
				cacheContext.lineWidth=2;
				candleY=middleY+(value.axis[0]-middleY)*process;
				cacheContext.moveTo(x,candleY);
				cacheContext.lineTo(middleX,candleY);
				cacheContext.moveTo(middleX,middleY+(value.axis[2]-middleY)*process);
				cacheContext.lineTo(middleX,candleY);
				cacheContext.lineTo(x+kWidth,candleY);
				candleY=middleY+(value.axis[3]-middleY)*process;
				cacheContext.lineTo(x+kWidth,candleY);
				cacheContext.lineTo(middleX,candleY);
				cacheContext.moveTo(middleX,middleY+(value.axis[1]-middleY)*process);
				cacheContext.lineTo(middleX,candleY);
				cacheContext.lineTo(x,candleY);
				cacheContext.lineTo(x,middleY+(value.axis[0]-middleY)*process);
				cacheContext.stroke();
			};

			/*
			 * 绿色K线，从上往下画
			 * 传入蜡烛左侧x坐标和K线数据[日期，开盘价，最高价，最低价，收盘价，成交量]为参数
			 */
			drawDownCandle=function(x,value){
				middleX=painterTool.getOdd(x+kWidth/2);
				middleY=value.axis[4];
				cacheContext.beginPath();
				cacheContext.fillStyle=kColor[value.color];
				cacheContext.strokeStyle=kColor[value.color];
				cacheContext.lineWidth=2;
				candleY=middleY+(value.axis[0]-middleY)*process;
				cacheContext.moveTo(x,candleY);
				cacheContext.lineTo(x+kWidth,candleY);
				candleY=middleY+(value.axis[3]-middleY)*process;
				cacheContext.lineTo(x+kWidth,candleY);
				cacheContext.lineTo(x,candleY);
				cacheContext.closePath();
				cacheContext.fill();
				cacheContext.stroke();
				cacheContext.beginPath();
				cacheContext.moveTo(middleX,middleY+(value.axis[1]-middleY)*process);
				cacheContext.lineTo(middleX,middleY+(value.axis[2]-middleY)*process);
				cacheContext.stroke();
			};

			/*
			 * 绘制ma均线
			 * 传入索引，表示绘制哪一个均线
			 */
			drawMA=function(index){
				var value,x,l;
				value=data.maData[index];
				x=leftX+gapWidth+kWidth/2;
				l=start+Math.floor((end-start)*process);
				cacheContext.beginPath();
				cacheContext.strokeStyle=maColor[index];
				cacheContext.lineWidth=1;
				//为ma补足头部图形
				if(start>0){
					cacheContext.moveTo(leftX,(value[start].maAxis+topY+height*(max-value[start-1][0])/range)/2);
				}
				for(var i=start;i<l;i++){
					cacheContext.lineTo(x,value[i].maAxis);
					x+=gapWidth+kWidth;
				}
				//为ma补足尾部图形
				if(i==end){
					if(value[i]!="-"){
						cacheContext.lineTo(rightX,(value[i-1].maAxis+value[i].maAxis)/2);
					}
				}
				cacheContext.stroke();
			};
			
			//根据process进度情况，绘制K线蜡烛图图形帧
			drawFrame=function(){
				drawGrid();
				candleX=leftX+gapWidth;
				for(var i=start;i<end;i++){
					if(data[i].color==1){
						drawUpCandle(candleX,data[i]);
					}else{
						drawDownCandle(candleX,data[i]);
					}
					candleX+=gapWidth+kWidth;
				}
				for(i in data.maData){
					drawMA(i);
				}
			};

			//绘制x轴tip
			drawXTip=function(x,data){
				var content,contentLength;
				//线
				cacheCursorContext.beginPath();
				cacheCursorContext.strokeStyle="#000";
				cacheCursorContext.moveTo(x,topY);
				cacheCursorContext.lineTo(x,bottomY);
				cacheCursorContext.stroke();
				//文字
				content=data[0];
				cacheCursorContext.fillStyle="#999";
				cacheCursorContext.font=fontSize+"px Arial";
				cacheCursorContext.textBaseline="bottom";
				contentLength=cacheCursorContext.measureText(content).width/2;
				if(x+contentLength>rightX){
					cacheCursorContext.textAlign="right";
					cacheCursorContext.fillText(content,rightX,bottomY);
				}else if(x-contentLength<leftX){
					cacheCursorContext.textAlign="left";
					cacheCursorContext.fillText(content,leftX,bottomY);
				}else{
					cacheCursorContext.textAlign="center";
					cacheCursorContext.fillText(content,x,bottomY);
				}
			};

			//绘制y轴tip
			drawYTip=function(y,data){
				var content;
				if(y>bottomY){
					y=bottomY;
				}
				//线
				cacheCursorContext.beginPath();
				cacheCursorContext.strokeStyle="#000";
				cacheCursorContext.moveTo(leftX,y);
				cacheCursorContext.lineTo(rightX,y);
				cacheCursorContext.stroke();
				//文字
				content=(max-range*(y-topY)/height).toFixed(2);
				cacheCursorContext.fillStyle="#999";
				cacheCursorContext.font=fontSize+"px Arial";
				cacheCursorContext.textAlign="left";
				cacheCursorContext.textBaseline="middle";
				cacheCursorContext.fillText(content,leftX,y);
			};

			//显示蜡烛图十字光标
			drawCursor=function(x,y){
				//计算触控事件所在的K线数据索引
				cursorIndex=Math.ceil((x-leftX-gapWidth/2)/(gapWidth+kWidth));
				/*for(var i= 0,cx=gapWidth/2;cx<x;i++,cx+=gapWidth+kWidth){

				}
				cursorIndex=i;
				cursorX=cx-gapWidth/2-kWidth/2;*/
				//光标头部越界
				cursorIndex=cursorIndex<1 ? 1:cursorIndex;
				//光标尾部越界
				cursorIndex=cursorIndex<end-start ? cursorIndex:end-start;
				//计算柱中心坐标
				cursorX=painterTool.getOdd(leftX+cursorIndex*(gapWidth+kWidth)-kWidth/2);
				//尾部取数据数组越界
				cursorIndex+=start-1;
				drawXTip(cursorX,data[cursorIndex]);
				drawYTip(painterTool.getOdd(y),data[cursorIndex]);
			};

			/*
			 * 初始化基本配置
			 * 数据不在init方法中被传入，否则触控事件就要多次不必要的调用init方法
			 */
			initSize=function(){
				initValue();
			};
			
			/*
			 * 根据传入的数据初始化配置变量，每次执行drawReady就认为数据有变化
			 * 接收二维数组为参数，每一项包含[日期，开盘价，最高价，最低价，收盘价，成交量];
			 * candleData本身为数组，包含maData指针指向均线数组，axis属性指向坐标数组
			 */
			drawReady=function(candleData,startPosition,endPosition){
				if(!candleData || candleData.length==0){
					return ;
				}
				data=candleData;
				start=startPosition;
				end=endPosition;
				handleData();
			};

			//onresize重绘
			resizeDraw=function(){
				initValue();
				calcAxis();
				drawFrame();
			};

			//判断x,y是否在绘制区域内
			insideOf=function(x,y){
				if(x>=leftX && x<=rightX && y>=topY && y<=bottomY){
					return true;
				}else{
					return false;
				}
			};

			//绘制蜡烛图十字光标
			showCursor=function(x,y){
				drawCursor(x,y);
			};
			
			return {
				initSize:initSize,
				drawReady:drawReady,
				drawFrame:drawFrame,
				resizeDraw:resizeDraw,
				showCursor:showCursor,
				insideOf:insideOf
			};
		})();
		
		/*
		 * K线交易量柱状图绘图器，子绘图器操作在缓冲画布中，不影响显示
		 */
		kBarPainter=(function(){
			//数据
			var data,initValue,max,width,height,leftX,rightX,topY,
				bottomY,barX,layout,start,end;
			//方法
			var initSize,drawReady,resizeDraw,drawFrame,handleData,drawGrid,
				drawBar,calcAxis,insideOf,drawMA,showCursor,drawCursor;
			//固定配置
			layout={a:0.74,b:0.01,c:0.01,d:0.01};

			initValue=function(){
				leftX=painterTool.getOdd(realCanvas.width*layout.d,false);
				rightX=painterTool.getOdd(realCanvas.width*(1-layout.b),true);
				topY=painterTool.getOdd(realCanvas.height*layout.a,false);
				bottomY=painterTool.getOdd(realCanvas.height*(1-layout.c),true);
				width=rightX-leftX;
				height=bottomY-topY;
			};

			//计算交易量柱的高度
			calcAxis=function(){
				var i,k;
				for(i=start;i<end;i++){
					data[i].baHeight=data[i][5]/max*height;
					for(k in data.maData){
						data.maData[k][i].maBaAxis=bottomY-height*data.maData[k][i][1]/max;
					}
				}

			};

			//计算成交量的最大值
			handleData=function(){
				var i,j,temp;
				max=data[start][5];
				for(i=start;i<end;i++){
					if(max<data[i][5]){
						max=data[i][5];
					}
					for(j in data.maData){
						if(max<data.maData[j][i][1]){
							max=data.maData[j][i][1];
						}
					}
				}
				//比较均线值头尾数据
				if(start>0){
					temp=start-1;
					for(j in data.maData){
						if(max<data.maData[j][temp][1]){
							max=data.maData[j][temp][1];
						}
					}
				}
				if(end<data.length){
					temp=end+1;
					for(j in data.maData){
						if(max<data.maData[j][temp][1]){
							max=data.maData[j][temp][1];
						}
					}
				}
				calcAxis();
			};

			//绘制边框虚线
			drawGrid=function(){
				var y;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#000";
				cacheContext.lineWidth=1;
				//绘制实线
				cacheContext.moveTo(leftX,topY);
				cacheContext.lineTo(rightX,topY);
				cacheContext.lineTo(rightX,bottomY);
				cacheContext.lineTo(leftX,bottomY);
				cacheContext.closePath();
				cacheContext.stroke();
				//绘制虚线
				y=painterTool.getOdd(topY+height/2);
				painterTool.drawDashed({x:leftX,y:y},{x:rightX,y:y});
				//绘制y轴文字
				cacheContext.fillStyle="#999";
				cacheContext.font=fontSize+"px Arial";
				cacheContext.textAlign="left";
				cacheContext.textBaseline="top";
				cacheContext.fillText("成交量:"+max,leftX,topY);
			};

			//绘制成交量柱
			drawBar=function(x,data){
				var y;
				cacheContext.beginPath();
				cacheContext.fillStyle=kColor[data.color];
				cacheContext.moveTo(x,bottomY);
				cacheContext.lineTo(x+kWidth,bottomY);
				y=bottomY-data.baHeight*process;
				cacheContext.lineTo(x+kWidth,y);
				cacheContext.lineTo(x,y);
				cacheContext.closePath();
				cacheContext.fill();
			};

			//绘制成交量ma均线
			drawMA=function(index){
				var value,x,l;
				value=data.maData[index];
				x=leftX+gapWidth+kWidth/2;
				l=start+Math.floor((end-start)*process);
				cacheContext.beginPath();
				cacheContext.strokeStyle=maColor[index];
				cacheContext.lineWidth=1;
				//为ma补足头部图形
				if(start>0){
					cacheContext.moveTo(leftX,(value[start].maBaAxis+bottomY-height*value[start-1][1]/max)/2);
				}
				for(var i=start;i<l;i++){
					cacheContext.lineTo(x,value[i].maBaAxis);
					x+=gapWidth+kWidth;
				}
				//为ma补足尾部图形
				if(i==end){
					if(value[i]!="-"){
						cacheContext.lineTo(rightX,(value[i-1].maBaAxis+value[i].maBaAxis)/2);
					}
				}
				cacheContext.stroke();
			};

			//根据process进度情况，绘制交易量图形帧
			drawFrame=function(){
				drawGrid();
				barX=leftX+gapWidth;
				for(var i=start;i<end;i++){
					drawBar(barX,data[i]);
					barX+=gapWidth+kWidth;
				}
				for(i in data.maData){
					drawMA(i);
				}
			};

			//显示日K交易量图十字光标
			drawCursor=function(x,y){
				cacheCursorContext.beginPath();
				cacheCursorContext.strokeStyle="#000";
				cacheCursorContext.moveTo(cursorX,topY);
				cacheCursorContext.lineTo(cursorX,bottomY);
				cacheCursorContext.stroke();
			};

			/*
			 * 初始化基本配置
			 * 数据不在initSize方法中被传入，否则触控事件就要多次不必要的调用init方法
			 */
			initSize=function(){
				initValue();
			};

			/*
			 * 根据传入的数据初始化配置变量，每次执行drawReady就认为数据有变化
			 * 接收二维数组为参数，每一项包含[日期，开盘价，最高价，最低价，收盘价，成交量];
			 */
			drawReady=function(barData,startPosition,endPosition){
				if(!barData || barData.length==0){
					return ;
				}
				data=barData;
				start=startPosition;
				end=endPosition;
				handleData();
			};

			//onresize重绘
			resizeDraw=function(){
				initValue();
				calcAxis();
				drawFrame();
			};

			//判断x,y是否在绘制区域内
			insideOf=function(x,y){
				if(x>=leftX && x<=rightX && y>=topY && y<=bottomY){
					return true;
				}else{
					return false;
				}
			};

			//绘制日K线交易量图十字光标
			showCursor=function(x,y){
				drawCursor(x,y);
			};

			return {
				initSize:initSize,
				drawReady:drawReady,
				drawFrame:drawFrame,
				resizeDraw:resizeDraw,
				showCursor:showCursor,
				insideOf:insideOf
			};
		})();

		/*
		 * 分时图绘图器
		 */
		trendPainter=(function(){
			//变量
			var data,layout,width,height,leftX,rightX,topY,bottomY,
				middle,max,min,range,amount,range,start,end,
				marketDetail,trendX,valueMax,period;
			//方法
			var initSize,drawReady,resizeDraw,initValue,draw1Grid,handleData,
				draw1Frame,calcAxis,insideOf,draw1Trend,draw1Text,draw5Frame,
				draw5Grid,draw5Trend,draw5Text,drawFrame;

			//为固定配置变量赋值
			layout={a:0.01,b:0.01,c:0.3,d:0.01};

			//设置布局属性，画布长宽会在resize时重新计算
			initValue=function(){
				leftX=painterTool.getOdd(realCanvas.width*layout.d,false);
				rightX=painterTool.getOdd(realCanvas.width*(1-layout.b),true);
				topY=painterTool.getOdd(realCanvas.height*layout.a,false);
				bottomY=painterTool.getOdd(realCanvas.height*(1-layout.c),true);
				width=rightX-leftX;
				height=bottomY-topY;
			};

			//计算分时图坐标点
			calcAxis=function(){
				var i,j,k;
				for(i=start;i<end;i++){
					data[i].axis=topY+height*(max-data[i][1])/range;
					data[i].avgAxis=topY+height*(max-data[i][2])/range;
				}
			};

			//处理数据，计算最大值最小值
			handleData=function(){
				var i,l;
				amount=marketDetail.amount;
				//分时图的成交量图头尾都为半根
				kWidth=width*(1-gapOccupy)/amount;
				gapWidth=width*gapOccupy/amount;
				middle=data.preclosePx;
				max=min=middle;
				//for(i=0,l=data.length;i<l;i++){
				for(i=start;i<end;i++){
					if(max<data[i][1]){
						max=data[i][1];
					}
					if(min>data[i][1]){
						min=data[i][1];
					}
				}
				//记录数据最大值（不一定是y轴最大值），后面设置渐变用
				valueMax=max;
				max=Math.max(max-middle,Math.abs(min-middle));
				max=middle+max;
				min=middle-(max-middle);
				range=max-min;
				calcAxis();
			};

			//绘制分时图边框
			draw1Grid=function(){
				var stepY,avg,i,l,x,position,date;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#000";
				cacheContext.lineWidth=1;
				//绘制实线
				cacheContext.moveTo(leftX,topY);
				cacheContext.lineTo(rightX,topY);
				cacheContext.lineTo(rightX,bottomY);
				cacheContext.lineTo(leftX,bottomY);
				cacheContext.closePath();
				cacheContext.stroke();
				//绘制虚线
				stepY=height/4;
				for(i=1;i<4;i++){
					painterTool.drawDashed(
						{x:painterTool.getOdd(leftX),y:painterTool.getOdd(topY+i*stepY)},
						{x:painterTool.getOdd(rightX),y:painterTool.getOdd(topY+i*stepY)}
					);
				}
				//绘制分时时间
				avg=marketDetail.singleDay/marketDetail.length;
				cacheContext.font=fontSize+"px Arial";
				cacheContext.textAlign="center";
				cacheContext.textBaseline="top";
				cacheContext.fillStyle="#999";
				for(i=1,l=marketDetail.length;i<l;i++){
					position=i*avg;
					if(position>=start && position<end){
						x=leftX+(position-start)*(gapWidth+kWidth);
						painterTool.drawDashed(
							{x:painterTool.getOdd(x),y:painterTool.getOdd(topY)},
							{x:painterTool.getOdd(x),y:painterTool.getOdd(bottomY)}
						);
						cacheContext.fillText(marketDetail[i-1].close_time+"/"+marketDetail[i].open_time,x,topY);
					}
				}
				//绘制头尾x轴时间
				cacheContext.textAlign="left";
				date=data[start][0]+"";
				date=date.substring(date.length-4,date.length-2)+":"+date.substring(date.length-2,date.length);
				cacheContext.fillText(date,leftX,bottomY);
				cacheContext.textAlign="right";
				date=data[end-1][0]+"";
				date=date.substring(date.length-4,date.length-2)+":"+date.substring(date.length-2,date.length);
				cacheContext.fillText(date,rightX,bottomY);
			};

			//绘制坐标轴文字
			draw1Text=function(){
				var middleY;
				middleY=topY+height/2;
				//绘制y轴数字
				cacheContext.font=fontSize+"px Arial";
				cacheContext.textAlign="left";
				cacheContext.textBaseline="top";
				cacheContext.fillStyle=kColor[1];
				cacheContext.fillText(max.toFixed(2),leftX,topY);
				cacheContext.textAlign="right";
				cacheContext.fillText((100*(max-middle)/middle).toFixed(2)+"%",rightX,topY);
				cacheContext.textAlign="left";
				cacheContext.textBaseline="bottom";
				cacheContext.fillStyle=kColor[0];
				cacheContext.fillText(min.toFixed(2),leftX,bottomY);
				cacheContext.textAlign="right";
				cacheContext.fillText((100*(middle-min)/middle).toFixed(2)+"%",rightX,bottomY);
				cacheContext.textAlign="left";
				cacheContext.textBaseline="middle";
				cacheContext.fillStyle="#999";
				cacheContext.fillText(middle.toFixed(2),leftX,middleY);
				cacheContext.textAlign="right";
				cacheContext.fillText("0.00%",rightX,middleY);
			};

			//绘制分时图折线图&渐变阴影图
			draw1Trend=function(){
				var i,l,gradient;
				//避免出现卡顿动画
				if(end-start<40){
					process=1;
				}
				trendX=leftX;
				l=start+Math.floor((end-start)*process);
				//---绘制折线图
				cacheContext.beginPath();
				cacheContext.strokeStyle="#3b7fed";
				cacheContext.moveTo(trendX,data[start].axis);
				for(i=start+1;i<l-1;i++){
					trendX+=gapWidth+kWidth;
					cacheContext.lineTo(trendX,data[i].axis);
				}
				//为避免最后一个数据超出grid，单独处理
				trendX+=gapWidth+kWidth;
				if(trendX>rightX){
					trendX=rightX;
				}
				cacheContext.lineTo(trendX,data[i].axis);
				cacheContext.stroke();
				//---绘制渐变阴影
				cacheContext.beginPath();
				gradient=cacheContext.createLinearGradient(leftX,topY+height*(max-valueMax)/range,leftX,bottomY);
				gradient.addColorStop(0.45,"#c2deff");
				gradient.addColorStop(1,"rgba(255,255,255,0)");
				cacheContext.fillStyle=gradient;
				cacheContext.moveTo(leftX,bottomY);
				trendX=leftX;
				for(i=start;i<l-1;i++){
					cacheContext.lineTo(trendX,data[i].axis);
					trendX+=gapWidth+kWidth;
				}
				//为避免最后一个数据超出grid，单独处理
				if(trendX>rightX){
					trendX=rightX;
				}
				cacheContext.lineTo(trendX,data[i].axis);
				cacheContext.lineTo(trendX,bottomY);
				cacheContext.closePath();
				cacheContext.fill();
				//---绘制分时图均价线
				trendX=leftX;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#ffc436";
				cacheContext.moveTo(trendX,data[start].avgAxis);
				for(i=start+1;i<l-1;i++){
					trendX+=gapWidth+kWidth;
					cacheContext.lineTo(trendX,data[i].avgAxis);
				}
				//为避免最后一个数据超出grid，单独处理
				trendX+=gapWidth+kWidth;
				if(trendX>rightX){
					trendX=rightX;
				}
				cacheContext.lineTo(trendX,data[i].avgAxis);
				cacheContext.stroke();
			};

			//绘制五日分时网格
			draw5Grid=function(){
				var stepY,i,x,amount,l,date,position;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#000";
				cacheContext.lineWidth=1;
				//绘制实线
				cacheContext.moveTo(leftX,topY);
				cacheContext.lineTo(rightX,topY);
				cacheContext.lineTo(rightX,bottomY);
				cacheContext.lineTo(leftX,bottomY);
				cacheContext.closePath();
				cacheContext.stroke();
				//绘制虚线
				amount=4;
				stepY=height/amount;
				for(i=1;i<amount;i++){
					painterTool.drawDashed(
						{x:painterTool.getOdd(leftX),y:painterTool.getOdd(topY+i*stepY)},
						{x:painterTool.getOdd(rightX),y:painterTool.getOdd(topY+i*stepY)}
					);
				}
				//绘制分时时间
				amount=5;
				l=data.marketDetail.singleDay;
				cacheContext.font=fontSize+"px Arial";
				cacheContext.textAlign="left";
				cacheContext.textBaseline="top";
				cacheContext.fillStyle="#999";
				if(start==0){
					date=data[0][0]+"";
					date=date.substring(4,6)+"-"+date.substring(6,8);
					cacheContext.fillText(date,leftX,bottomY);
				}
				for(i=1;i<amount;i++){
					position=i*l;
					if(position>=start && position<end){
						x=leftX+(position-start)*(gapWidth+kWidth);
						date=data[position][0]+"";
						date=date.substring(4,6)+"-"+date.substring(6,8);
						cacheContext.fillText(date,x,bottomY);
						painterTool.drawDashed(
							{x:painterTool.getOdd(x),y:painterTool.getOdd(topY)},
							{x:painterTool.getOdd(x),y:painterTool.getOdd(bottomY)}
						);
					}
				}
			};

			//绘制五日分时图折线图&渐变阴影图&均价
			draw5Trend=function(){
				var i,l,gradient,amount;
				//避免出现卡顿动画
				if(end-start<40){
					process=1;
				}
				trendX=leftX;
				l=start+Math.floor((end-start)*process);
				amount=marketDetail.singleDay;
				//---绘制折线图
				cacheContext.beginPath();
				cacheContext.strokeStyle="#3b7fed";
				cacheContext.moveTo(trendX,data[start].axis);
				for(i=start+1;i<l-1;i++){
					trendX+=gapWidth+kWidth;
					if(i%amount==0){
						cacheContext.stroke();
						cacheContext.beginPath();
						cacheContext.moveTo(trendX,data[i].axis);
						continue;
					}
					cacheContext.lineTo(trendX,data[i].axis);
				}
				//为避免最后一个数据超出grid，单独处理
				trendX+=gapWidth+kWidth;
				if(trendX>rightX){
					trendX=rightX;
				}
				cacheContext.lineTo(trendX,data[i].axis);
				cacheContext.stroke();
				//---绘制渐变阴影
				cacheContext.beginPath();
				gradient=cacheContext.createLinearGradient(leftX,topY+height*(max-valueMax)/range,leftX,bottomY);
				gradient.addColorStop(0.45,"#c2deff");
				gradient.addColorStop(1,"rgba(255,255,255,0)");
				cacheContext.fillStyle=gradient;
				cacheContext.moveTo(leftX,bottomY);
				trendX=leftX;
				for(i=start;i<l-1;i++){
					cacheContext.lineTo(trendX,data[i].axis);
					trendX+=gapWidth+kWidth;
				}
				//为避免最后一个数据超出grid，单独处理
				if(trendX>rightX){
					trendX=rightX;
				}
				cacheContext.lineTo(trendX,data[i].axis);
				cacheContext.lineTo(trendX,bottomY);
				cacheContext.closePath();
				cacheContext.fill();
				//---绘制分时图均价线
				trendX=leftX;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#ffc436";
				cacheContext.moveTo(trendX,data[start].avgAxis);
				for(i=start+1;i<l-1;i++){
					trendX+=gapWidth+kWidth;
					if(i%amount==0){
						cacheContext.stroke();
						cacheContext.beginPath();
						cacheContext.moveTo(trendX,data[i].axis);
						continue;
					}
					cacheContext.lineTo(trendX,data[i].avgAxis);
				}
				//为避免最后一个数据超出grid，单独处理
				trendX+=gapWidth+kWidth;
				if(trendX>rightX){
					trendX=rightX;
				}
				cacheContext.lineTo(trendX,data[i].avgAxis);
				cacheContext.stroke();
			};

			//绘制五日分时图y轴坐标
			draw5Text=function(){
				var middleY;
				middleY=topY+height/2;
				//绘制y轴数字
				cacheContext.font=fontSize+"px Arial";
				cacheContext.textAlign="left";
				cacheContext.textBaseline="top";
				cacheContext.fillStyle=kColor[1];
				cacheContext.fillText(max.toFixed(2),leftX,topY);
				cacheContext.textAlign="right";
				cacheContext.fillText((100*(max-middle)/middle).toFixed(2)+"%",rightX,topY);
				cacheContext.textAlign="left";
				cacheContext.textBaseline="bottom";
				cacheContext.fillStyle=kColor[0];
				cacheContext.fillText(min.toFixed(2),leftX,bottomY);
				cacheContext.textAlign="right";
				cacheContext.fillText((100*(middle-min)/middle).toFixed(2)+"%",rightX,bottomY);
				cacheContext.textAlign="left";
				cacheContext.textBaseline="middle";
				cacheContext.fillStyle="#999";
				cacheContext.fillText(middle.toFixed(2),leftX,middleY);
				cacheContext.textAlign="right";
				cacheContext.fillText("0.00%",rightX,middleY);
			};

			//绘制一日分时图帧
			draw1Frame=function(){
				draw1Grid();
				draw1Trend();
				draw1Text();
			};

			//绘制五日分时图帧
			draw5Frame=function(){
				draw5Grid();
				draw5Trend();
				draw5Text();
			};

			//模块模式为一个闭包，输出函数不能动态变化
			drawFrame=function(){
				if(marketDetail.dayAmount==1){
					draw1Frame();
				}else if(marketDetail.dayAmount==5){
					draw5Frame();
				}
			};

			/*
			 * 初始化基本配置
			 * 数据不在initSize方法中被传入，否则触控事件就要多次不必要的调用init方法
			 */
			initSize=function(){
				initValue();
			};

			/*
			 * 根据传入的数据初始化配置变量，每次执行drawReady就认为数据有变化
			 * trendData为分时数据，包含preclosePx昨收价
			 * trendData包含marketDetail数组，开盘收盘时间数组和分时图总数
			 */
			drawReady=function(trendData,startPosition,endPosition){
				if(!trendData || trendData.length==0){
					return ;
				}
				data=trendData;
				start=startPosition;
				end=endPosition;
				marketDetail=data.marketDetail;
				handleData();
			};

			//onresize重绘
			resizeDraw=function(){
				initValue();
				calcAxis();
				drawFrame();
			};

			//判断x,y是否在分时图绘制区域内
			insideOf=function(x,y){
				if(x>=leftX && x<=rightX && y>=topY && y<=bottomY){
					return true;
				}else{
					return false;
				}
			};

			return {
				initSize:initSize,
				drawReady:drawReady,
				drawFrame:drawFrame,
				resizeDraw:resizeDraw,
				insideOf:insideOf
			};
		})();

		/*
		 * 分时图成交量绘图器
		 */
		trendBarPainter=(function(){
			//数据
			var data,initValue,max,width,height,leftX,rightX,topY,
				bottomY,barX,layout,start,end;
			//方法
			var initSize,drawReady,resizeDraw,drawFrame,handleData,drawGrid,
				drawBar,calcAxis,insideOf;
			//固定配置
			layout={a:0.74,b:0.01,c:0.01,d:0.01};

			initValue=function(){
				leftX=painterTool.getOdd(realCanvas.width*layout.d,false);
				rightX=painterTool.getOdd(realCanvas.width*(1-layout.b),true);
				topY=painterTool.getOdd(realCanvas.height*layout.a,false);
				bottomY=painterTool.getOdd(realCanvas.height*(1-layout.c),true);
				width=rightX-leftX;
				height=bottomY-topY;
			};

			//计算交易量柱的高度
			calcAxis=function(){
				var i;
				for(i=start;i<end;i++){
					data[i].baHeight=data[i][3]/max*height;
				}
			};

			//计算成交量的最大值
			handleData=function(){
				var i;
				max=data[start][3];
				for(i=start+1;i<end;i++){
					if(max<data[i][3]){
						max=data[i][3];
					}
				}
				calcAxis();
			};

			//绘制边框虚线
			drawGrid=function(){
				var y;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#000";
				cacheContext.lineWidth=1;
				//绘制实线
				cacheContext.moveTo(leftX,topY);
				cacheContext.lineTo(rightX,topY);
				cacheContext.lineTo(rightX,bottomY);
				cacheContext.lineTo(leftX,bottomY);
				cacheContext.closePath();
				cacheContext.stroke();
				//绘制虚线
				y=painterTool.getOdd(topY+height/2);
				painterTool.drawDashed({x:leftX,y:y},{x:rightX,y:y});
				//绘制y轴文字
				cacheContext.fillStyle="#999";
				cacheContext.font=fontSize+"px Arial";
				cacheContext.textAlign="left";
				cacheContext.textBaseline="top";
				cacheContext.fillText("成交量:"+max,leftX,topY);
			};

			//绘制成交量柱
			drawBar=function(x,data){
				var y;
				cacheContext.beginPath();
				cacheContext.fillStyle=kColor[data.color];
				cacheContext.moveTo(x,bottomY);
				cacheContext.lineTo(x+kWidth,bottomY);
				y=bottomY-data.baHeight*process;
				cacheContext.lineTo(x+kWidth,y);
				cacheContext.lineTo(x,y);
				cacheContext.closePath();
				cacheContext.fill();
			};

			//根据process进度情况，绘制交易量图形帧
			drawFrame=function(){
				var width=kWidth/2,y;
				drawGrid();
				//绘制头部半个交易量柱
				cacheContext.beginPath();
				cacheContext.fillStyle=kColor[data[start].color];
				cacheContext.moveTo(leftX,bottomY);
				cacheContext.lineTo(leftX+width,bottomY);
				y=bottomY-data[start].baHeight*process;
				cacheContext.lineTo(leftX+width,y);
				cacheContext.lineTo(leftX,y);
				cacheContext.closePath();
				cacheContext.fill();
				//绘制中间交易量柱
				barX=leftX+gapWidth+width;
				for(var i=start+1;i<end-1;i++){
					drawBar(barX,data[i]);
					barX+=gapWidth+kWidth;
				}
				//绘制尾部半个交易量柱
				if(barX+kWidth>rightX){
					cacheContext.beginPath();
					cacheContext.fillStyle=kColor[data[i].color];
					cacheContext.moveTo(rightX,bottomY);
					cacheContext.lineTo(rightX-width,bottomY);
					y=bottomY-data[i].baHeight*process;
					cacheContext.lineTo(rightX-width,y);
					cacheContext.lineTo(rightX,y);
					cacheContext.closePath();
					cacheContext.fill();
				}else{
					drawBar(barX,data[i]);
				}
			};

			/*
			 * 初始化基本配置
			 * 数据不在initSize方法中被传入，否则触控事件就要多次不必要的调用init方法
			 */
			initSize=function(){
				initValue();
			};

			/*
			 * 根据传入的数据初始化配置变量，每次执行drawReady就认为数据有变化
			 */
			drawReady=function(trendData,startPosition,endPosition){
				if(!trendData || trendData.length==0){
					return ;
				}
				data=trendData;
				start=startPosition;
				end=endPosition;
				handleData();
			};

			//onresize重绘
			resizeDraw=function(){
				initValue();
				calcAxis();
				drawFrame();
			};

			//判断x,y是否在绘制区域内
			insideOf=function(x,y){
				if(x>=leftX && x<=rightX && y>=topY && y<=bottomY){
					return true;
				}else{
					return false;
				}
			};

			return {
				initSize:initSize,
				drawReady:drawReady,
				drawFrame:drawFrame,
				resizeDraw:resizeDraw,
				insideOf:insideOf
			};
		})();

		/*
		 * 【K线蜡烛图、交易量柱图、MACD指标图】事件控制器，左右滑动、缩放事件、十字光标
		 */
		kControl=(function(){
			//变量
			var totalLength,minScale,maxScale,scaleStep,scrollStep,currScale,
				currPosition,data;
			//方法
			var init,draw,enlarge,narrow,scrollRight,scrollLeft,
				calcMA,calcColor,showCursor,clearCursor;
			//固定变量
			scaleStep=1;
			scrollStep=1;

			/*
			 * 计算均线值，传入股票数据和均线日期
			 * maData={
			 * 	5:[[K线ma5，交易量ma5]，[]...]
			 * }
			 */
			calcMA=function(){
				var i,j,k, l,sumk,sumb,maData;
				maData={};
				for(i=0,l=dayCount.length;i<l;i++){
					maData[dayCount[i]]=[];
					for(j=0;j<totalLength;j++){
						if(j<dayCount[i]){
							maData[dayCount[i]].push(["-","-"]);
							continue;
						}
						sumk=0;
						sumb=0;
						for(k=0;k<dayCount[i];k++){
							sumk+=data[j-k][4];
							sumb+=data[j-k][5];
						}
						maData[dayCount[i]].push([sumk/dayCount[i],sumb/dayCount[i]]);
					}
					maData[dayCount[i]].push("-");
				}
				data.maData=maData;
			};

			//计算颜色指标
			calcColor=function(){
				for(var i=0;i<totalLength;i++){
					//颜色指标
					if(data[i][4]>=data[i][1]){
						data[i].color=1;
					}else{
						data[i].color=0;
					}
				}
			};

			//日K十字光标
			showCursor=function(x,y){
				cacheCursorContext.clearRect(0,0,cacheCursorCanvas.width,cacheCursorCanvas.height);
				for(var i in painterStack){
					painterStack[i].showCursor(x,y);
				}
				refreshCursorCache();
			};

			//清除十字光标
			clearCursor=function(){
				cacheCursorContext.clearRect(0,0,cacheCursorCanvas.width,cacheCursorCanvas.height);
				refreshCursorCache();
			};

			//控制器启动绘图
			draw=function(){
				var start;
				start=currPosition-currScale;
				for(var i in painterStack){
					painterStack[i].drawReady(data,start,currPosition);
				}
				animate();
			};

			//初始化比例尺
			init=function(){
				data=rawData;
				totalLength=data.length;
				minScale=totalLength>40 ? 40:totalLength;
				maxScale=totalLength>100 ? 100:totalLength;
				currScale=totalLength>60 ? 60:totalLength;
				currPosition=totalLength;
				calcMA();
				calcColor();
				draw();
			};

			//放大-减少显示条数
			enlarge=function(){
				if(currScale>minScale){
					currScale-=scaleStep;
					if(currScale<minScale){
						currScale=minScale;
					}
					draw();
				}else{
					return ;
				}
			};

			//缩小-增加显示条数
			narrow=function(){
				if(currScale<maxScale){
					currScale+=scaleStep;
					if(currScale>maxScale){
						currScale=maxScale;
					}
					if(currScale>currPosition){
						currPosition=currScale;
					}
					draw();
				}else{
					return ;
				}
			};

			//手指向右滑动-数据向左滚动
			scrollRight=function(){
				if(currPosition>currScale){
					currPosition-=scrollStep;
					if(currPosition<currScale){
						currPosition=currScale;
					}
					draw();
				}else{
					return ;
				}
			};

			//手指向左滑动-数据向右滚动
			scrollLeft=function(){
				if(currPosition<totalLength){
					currPosition+=scrollStep;
					if(currPosition>totalLength){
						currPosition=totalLength;
					}
					draw();
				}else{
					return ;
				}
			};

			return {
				init:init,
				enlarge:enlarge,
				narrow:narrow,
				scrollLeft:scrollLeft,
				scrollRight:scrollRight,
				showCursor:showCursor,
				clearCursor:clearCursor
			};
		})();

		/*
		 * 【K线分时图、交易量柱图】事件控制器，左右滑动、缩放事件、十字光标
		 */
		trendControl=(function(){
			//变量
			var totalLength,minScale,maxScale,scaleStep,scrollStep,currScale,
				currPosition,data;
			//方法
			var init,draw,enlarge,narrow,scrollRight,scrollLeft,calcColor,
				calcBusinessAmount;
			//固定变量
			scaleStep=5;
			scrollStep=2;

			//计算交易量值
			calcBusinessAmount=function(){
				var i,l;
				//增量分时图
				if(data.append){
					i=data.length-1;
					data[i][3]=data[i][3]-data.lastBA;
					return ;
				}
				//倒叙相减
				for(l=data.length,i=l-1;i>0;i--){
					data[i][3]=data[i][3]-data[i-1][3];
				}
			};

			//计算交易量柱的颜色
			calcColor=function(){
				var i,l;
				//增量分时图
				if(data.append){
					i=data.length-1;
					data[i].color=data[i][1]<data[i-1][1] ? 0:1;
					return ;
				}
				//第一个柱和昨收比
				if(data[0][1]<data.preclosePx){
					data[0].color=0;
				}else{
					data[0].color=1;
				}
				for(i=1,l=data.length;i<l;i++){
					if(data[i][1]<data[i-1][1]){
						data[i].color=0;
					}else{
						data[i].color=1;
					}
				}
			};

			//控制器启动绘图
			draw=function(){
				var start,end;
				start=currPosition-currScale;
				start=start<0 ? 0:start;
				end=currPosition<data.length ? currPosition+1:data.length;
				//放大缩小时
				data.marketDetail.amount=currScale;
				for(var i in painterStack){
					painterStack[i].drawReady(data,start,end);
				}
				animate();
			};

			//初始化比例尺
			init=function(){
				data=rawData;
				totalLength=data.marketDetail.amount;
				minScale=parseInt(totalLength*0.65);
				maxScale=totalLength;
				currScale=totalLength;
				currPosition=totalLength;
				calcBusinessAmount();
				calcColor();
				draw();
			};

			//放大-减少显示条数
			enlarge=function(){
				if(currScale>minScale){
					currScale-=scaleStep;
					if(currScale<minScale){
						currScale=minScale;
					}
					draw();
				}else{
					return ;
				}
			};

			//缩小-增加显示条数
			narrow=function(){
				if(currScale<maxScale){
					currScale+=scaleStep;
					if(currScale>maxScale){
						currScale=maxScale;
					}
					if(currScale>currPosition){
						currPosition=currScale;
					}
					draw();
				}else{
					return ;
				}
			};

			//手指向右滑动-数据向左滚动
			scrollRight=function(){
				if(currPosition>currScale){
					currPosition-=scrollStep;
					if(currPosition<currScale){
						currPosition=currScale;
					}
					draw();
				}else{
					return ;
				}
			};

			//手指向左滑动-数据向右滚动
			scrollLeft=function(){
				if(currPosition<totalLength){
					currPosition+=scrollStep;
					if(currPosition>totalLength){
						currPosition=totalLength;
					}
					draw();
				}else{
					return ;
				}
			};

			return {
				init:init,
				enlarge:enlarge,
				narrow:narrow,
				scrollLeft:scrollLeft,
				scrollRight:scrollRight
			};
		})();

		/*------------------------绘图器end---------------------------*/
		/*
		 * 管理K线图的事件，绑定、解绑、页面刷新时重计算坐标
		 */
		eventControl=(function(){
			//变量
			var hammerManager,hammerPan,hammerPinch,hammerPress,offsetLeft,offsetTop,
				x,y,cursorShowed;
			//方法-避免事件未被清理
			var press,pressup,panup,pandown,panright,panleft,
				panend,pinchin,pinchout,mousewheel,setup,bindListener,
				destroy,setOffset;
			hammerPan=new Hammer.Pan();
			hammerPinch = new Hammer.Pinch();
			hammerPress=new Hammer.Press();
			hammerManager=new Hammer.Manager(container);
			hammerManager.add([hammerPan,hammerPinch,hammerPress]);

			//长按
			press=function(e){
				cursorShowed=true;
				currControl.showCursor(x,y);
			};

			//抬起手指
			pressup=function(e){
				cursorShowed=false;
				currControl.clearCursor();
			};

			//向上滑
			panup=function(e){
				if(cursorShowed){
					currControl.showCursor(x,y);
				}
			};

			//向下滑
			pandown=function(e){
				if(cursorShowed){
					currControl.showCursor(x,y);
				}
			};

			//手指右滑
			panright=function(e){
				if(cursorShowed){
					currControl.showCursor(x,y);
				}else{
					currControl.scrollRight();
				}
			};

			//手指左滑
			panleft=function(e){
				if(cursorShowed){
					currControl.showCursor(x,y);
				}else{
					currControl.scrollLeft();
				}
			};

			//结束滑动
			panend=function(e){
				if(cursorShowed){
					cursorShowed=false;
					currControl.clearCursor();
				}
			};

			//缩小
			pinchin=function(e){
				currControl.narrow();
			};

			//放大
			pinchout=function(e){
				currControl.enlarge();
			};

			mousewheel=function(e){
				if(e.wheelDelta>0){
					pinchin(e);
				}else if(e.wheelDelta<0){
					pinchout(e);
				}
				e.preventDefault();
			};

			//AOP封装方法
			setup=function(callback){
				return function(e){
					x=(e.changedPointers[0].pageX-offsetLeft)*pixel;
					y=(e.changedPointers[0].pageY-offsetTop)*pixel;
					for(var i in painterStack){
						if(painterStack[i].insideOf(x,y)){
							callback(e);
						}
					}
				};
			};

			bindListener=function(){
				//绑定所有事件
				hammerManager.on("press",setup(press));
				hammerManager.on("pressup",setup(pressup));
				hammerManager.on("panup",setup(panup));
				hammerManager.on("pandown",setup(pandown));
				hammerManager.on("panright",setup(panright));
				hammerManager.on("panleft",setup(panleft));
				hammerManager.on("panend",setup(panend));
				hammerManager.on("pinchin",pinchin);
				hammerManager.on("pinchout",pinchout);

				//鼠标滚动缩放事件
				container.addEventListener("mousewheel",mousewheel);
			};

			//销毁所有已绑定的事件
			destroy=function(){
				hammerManager.destroy();
				hammerManager=new Hammer.Manager(container);
				hammerManager.add([hammerPan,hammerPinch,hammerPress]);
			};

			//设置container的偏移量，计算坐标点
			setOffset=function(){
				offsetLeft=container.offsetLeft;
				offsetTop=container.offsetTop;
			};

			return {
				init:setOffset,
				bindListener:bindListener,
				destroy:destroy,
				resize:setOffset
			}

		})();

		/*
		 * 切换currControl，传入control对象
		 * 清除上一个control设置的监听事件
		 * 启动绘图方法
		 */
		triggerControl=function(control){
			if(currControl==control){
				currControl.init();
				return ;
			}
			painterStack=[];
			if(control==trendControl){
				painterStack.push(trendPainter);
				painterStack.push(trendBarPainter);
			}else if(control==kControl){
				painterStack.push(candlePainter);
				painterStack.push(kBarPainter);
			}
			eventControl.destroy();
			currControl=control;
			eventControl.bindListener();
			currControl.init();
		};

		/*
		 * 动画，执行所有进入方法栈的drawFrame方法
		 * 如果process为1，则animate退化成无动画绘制
		 * 每个页面只执行一次动画，要修改的话，在最后一次animate将process初始化
		 */
		animate=function(){
			cacheContext.clearRect(0,0,cacheCanvas.width,cacheCanvas.height);
			speed=Math.ceil((100-process*100)/30)/100;
			process+=speed;
			if(process<1){
				for(var i in painterStack){
					painterStack[i].drawFrame();
				}
				requestAnimationFrame(animate);
			}else{
				process=1;
				for(var i in painterStack){
					painterStack[i].drawFrame();
				}
			}
			refreshCache();
		};

		//将虚拟画布上的图形刷新到画布上
		refreshCache=function(){
			container.removeChild(realCanvas);
			realContext.clearRect(0,0,realCanvas.width,realCanvas.height);
			realContext.drawImage(cacheCanvas,0,0);
			container.appendChild(realCanvas);
		};

		//十字光标的画布缓冲绘图
		refreshCursorCache=function(){
			container.removeChild(realCursorCanvas);
			realCursorContext.clearRect(0,0,realCursorCanvas.width,realCursorCanvas.height);
			realCursorContext.drawImage(cacheCursorCanvas,0,0);
			container.appendChild(realCursorCanvas);
		};

		//全局初始化，调用各个内部初始化方法，页面就绪即可执行
		init=function(){
			initCanvas();
			eventControl.init();
			candlePainter.initSize();
			kBarPainter.initSize();
			trendPainter.initSize();
			trendBarPainter.initSize();
		};
		
		//开始绘制,接收接口返回的数据
		draw=function(ajaxData,period){
			loading=false;
			rawData=ajaxData;
			if(period>9){
				//分时图
				triggerControl(trendControl);
			}else{
				//K线图
				triggerControl(kControl);
			}
		};

		//窗口大小变化时重绘
		resize=function(){
			initCanvas();
			cacheContext.clearRect(0,0,cacheCanvas.width,cacheCanvas.height);
			for(var i in painterStack){
				painterStack[i].resizeDraw();
			}
			eventControl.resize();
			refreshCache();
		};

		//查询股票资料时展示loading
		showLoading=function(){
			realContext.clearRect(0,0,realCanvas.width,realCanvas.height);
			loading=true;
			setTimeout(function(){
				if(loading){
					cacheContext.clearRect(0,0,cacheCanvas.width,cacheCanvas.height);
					cacheContext.font=fontSize*2+"px Arial";
					cacheContext.textBaseline="bottom";
					cacheContext.textAlign="center";
					cacheContext.fillStyle="#999";
					cacheContext.fillText("Loading...",cacheCanvas.width/2,cacheCanvas.height*0.382);
					refreshCache();
				}
			},100);
		};

		return {
			init:init,
			draw:draw,
			resize:resize,
			showLoading:showLoading
		};
	})();

	/*
	 * 请求分派器，管理所有的ajax请求，并执行相应操作
	 */
	requestDispatcher=(function(){
		//变量
		var authorization,storage,supportType,crc,minTime,trendTimer;
		//方法
		var queryToken,queryKLine,queryTrend,queryMarketDetail,queryPreclosePx,handleToken,
			handleKLine,handleTrend,handleMarketDetail,getKLine,setTimer,storeStorage,
			queryTrend5Day,appendTrend,handleAppend;
		/*
		 * storage={
		 * 	code:
		 * 	period:
		 * 	trend:
		 * 	amount:
		 * 	preclosePx:
		 * }
		 */
		storage={};
		supportType={
			"1分钟":1,
			"5分钟":2,
			"15分钟":3,
			"30分钟":4,
			"60分钟":5,
			"日K":6,
			"周K":7,
			"月K":8,
			"年K":9,
			"分时":10,
			"五日":11
		};

		//分时图设置定时器，优化美股时差
		setTimer=function(){
			var i,l,now;
			clearInterval(trendTimer);
			trendTimer=setInterval(function(){
				if(storage.period<10){
					clearInterval(trendTimer);
					return ;
				}
				now=new Date();
				now=parseInt(now.getHours()+""+now.getMinutes());
				for(i=0,l=storage.marketDetail.length;i<l;i++){
					if(now>=storage.marketDetail[i].open_time && now<=storage.marketDetail[i].open_time){
						appendTrend();
					}
				}
			},6000);
		};

		/*
		 * 分时图多个数据存储
		 * real昨收 & marketDetail总量 & trend数据
		 */
		storeStorage=function(code,period,attr,data){
			if(code!=storage.code || period!=storage.period){
				return ;
			}
			storage[attr]=data;
			handleTrend();
		};

		//分时增量查询结果处理
		handleAppend=function(data){
			var now;
			storage.trend.append=true;
			if(data.length==1){
				storage.trend.pop();
				storage.trend.push(data[0]);
			}else{
				now=new Date();
				now=parseInt(now.getHours()+""+now.getMinutes());
				//开盘清数据
				if(now==storage.marketDetail[0].open_time){
					storage.trend=[];
				}
				storage.trend.pop();
				storage.trend.push(data[0]);
				storage.trend.push(data[1]);
				storage.trend.lastBA=data[0][3];
			}
			KPainter.draw(storage.trend,storage.period);
		};

		//校验code,period是否正确，执行蜡烛绘图方法
		handleKLine=function(code,period,data){
			if(code!=storage.code){
				return ;
			}
			if(period!=storage.period){
				return ;
			}
			KPainter.draw(data,period);
		};

		//检查数据完备与否，执行分时绘图方法，storage在刷新股票时会清空
		handleTrend=function(){
			if(storage.marketDetail==undefined || storage.trend==undefined || storage.preclosePx==undefined){
				return ;
			}
			storage.trend.preclosePx=storage.preclosePx;
			storage.trend.marketDetail=storage.marketDetail;
			storage.trend.lastBA=storage.trend[storage.trend.length-2][3];
			KPainter.draw(storage.trend,storage.period);
		};

		//检查数据完备与否，计算分时总量，时间分布。storage在刷新股票时会清空
		handleMarketDetail=function(code,period,data){
			var marketDetail,amount,temp,open,close,hour,minute;
			marketDetail=data.trade_section_grp;
			//openapi返回的时序有问题，冒泡排序
			for(var i=0,l=marketDetail.length;i<l;i++){
				for(var j=0,m=l-i-1;j<m;j++){
					if(marketDetail[j].open_time>marketDetail[j+1].open_time){
						temp=marketDetail[j];
						marketDetail[j]=marketDetail[j+1];
						marketDetail[j+1]=temp;
					}
				}
			}
			//计算时间差
			amount=0;
			for(i=0;i<l;i++){
				open=marketDetail[i].open_time.toString();
				close=marketDetail[i].close_time.toString();
				hour=close.substring(0,close.length-2)-open.substring(0,open.length-2);
				minute=close.substring(close.length-2,close.length)-open.substring(open.length-2,open.length);
				amount+=hour*60+minute;
			}
			if(period==10){
				marketDetail.amount=amount;
				marketDetail.dayAmount=1;
				marketDetail.singleDay=amount;
			}else if(period==11){
				marketDetail.amount=amount*5;
				marketDetail.dayAmount=5;
				marketDetail.singleDay=amount;
			}
			storeStorage(code,period,"marketDetail",marketDetail);
		};

		//openapi获取token成功
		handleToken=function(result){
			if(result){
				authorization=result.token_type+" "+result.access_token;
			}
			if(storage.period!=undefined && storage.code!=undefined){
				switch(storage.period){
					case 10:
						//分时图
						queryMarketDetail(storage.code,storage.period);
						queryTrend(storage.code,storage.period);
						queryPreclosePx(storage.code,storage.period);
						setTimer();
						break;
					case 11:
						//五日分时
						queryMarketDetail(storage.code,storage.period);
						queryTrend5Day(storage.code,storage.period);
						queryPreclosePx(storage.code,storage.period);
						setTimer();
						break;
					default:
						//K线图
						queryKLine(storage.code,storage.period);
						break;
				}
			}
		};

		//获取openapi的K线数据
		queryKLine=function(code,period){
			Util.ajax({
				type:"get",
				url:"https://open.hscloud.cn/quote/v1/kline",
				contentType:"application/x-www-form-urlencoded; charset=utf-8",
				data:{
					get_type:"offset",
					prod_code:code,
					candle_period:period,
					fields:"open_px,high_px,low_px,close_px,business_amount",
					data_count:200
				},
				beforeSend: function(request) {
					request.setRequestHeader("Authorization",authorization);
				},
				success:function(result){
					if(result){
						handleKLine(code,period,result.data.candle[code]);
					}
				},
				error:function(error){
					console.error("queryKLine:",error);
				}
			});
		};


		//获取openapi分时数据
		queryTrend=function(code,period){
			Util.ajax({
				type:"get",
				url:"https://open.hscloud.cn/quote/v1/trend",
				contentType:"application/x-www-form-urlencoded; charset=utf-8",
				data:{
					prod_code:code,
					fields:"last_px,avg_px,business_amount"
					//,date:20170308
				},
				beforeSend: function(request) {
					request.setRequestHeader("Authorization",authorization);
				},
				success:function(result){
					if(result){
						var data=result.data.trend[code];
						crc=result.data.trend.crc[code];
						minTime=data[data.length-1][0].toString().substring(8,12);
						storeStorage(code,period,"trend",data);
					}
				},
				error:function(error){
					console.error("queryTrend:",error);
				}
			});
		};

		//增量查询分时接口
		appendTrend=function(){
			Util.ajax({
				type:"get",
				url:"https://open.hscloud.cn/quote/v1/trend",
				contentType:"application/x-www-form-urlencoded; charset=utf-8",
				data:{
					prod_code:storage.code,
					fields:"last_px,avg_px,business_amount",
					crc:crc,
					min_time:minTime
					//,date:20170308
				},
				beforeSend: function(request) {
					request.setRequestHeader("Authorization",authorization);
				},
				success:function(result){
					if(result){
						var data=result.data.trend[storage.code];
						crc=result.data.trend.crc[storage.code];
						minTime=data[data.length-1][0].toString().substring(8,12);
						handleAppend(data);
					}
				},
				error:function(error){
					console.error("appendTrend:",error);
				}
			});
		};

		//获取openapi五日分时数据
		queryTrend5Day=function(code,period){
			Util.ajax({
				type:"get",
				url:"https://open.hscloud.cn/quote/v1/trend5day",
				contentType:"application/x-www-form-urlencoded; charset=utf-8",
				data:{
					prod_code:code,
					fields:"last_px,avg_px,business_amount"
				},
				beforeSend: function(request) {
					request.setRequestHeader("Authorization",authorization);
				},
				success:function(result){
					if(result){
						//增量查询
						var data=result.data.trend[code];
						storeStorage(code,period,"trend",data);
					}
				},
				error:function(){
					console.error("queryTrend:",error);
				}
			});
		};

		//获取分时图数据总量
		queryMarketDetail=function(code,period){
			var postfix=code.split(".")[1];
			//避免请求超时
			if(Config[postfix]){
				handleMarketDetail(code,period,Config[postfix]);
				return ;
			}
			//请求marketDetail
			Util.ajax({
				type:"get",
				url:"https://open.hscloud.cn/quote/v1/market/detail",
				contentType:"application/x-www-form-urlencoded",
				data:{
					finance_mic:postfix
					//finance_mic:"XSGE"
				},
				beforeSend:function(request) {
					request.setRequestHeader("Authorization",authorization);
				},
				success:function(result){
					if(result){
						handleMarketDetail(code,period,result.data);
					}
				},
				error:function(error){
					console.error("queryMarketDetail:",error);
				}
			});
		};

		//获取昨收价
		queryPreclosePx=function(code,period){
			var dataAcount;
			dataAcount=period==10 ? 2:6;
			Util.ajax({
				type:"get",
				url:"https://open.hscloud.cn/quote/v1/kline",
				contentType:"application/x-www-form-urlencoded; charset=utf-8",
				data:{
					get_type:"offset",
					prod_code:code,
					candle_period:6,
					fields:"close_px",
					data_count:dataAcount
				},
				beforeSend: function(request) {
					request.setRequestHeader("Authorization",authorization);
				},
				success:function(result){
					if(result){
						if(code==storage.code){
							storeStorage(code,period,"preclosePx",result.data.candle[code][0][1]);
						}
					}
				},
				error:function(error){
					console.error("queryPreclosePx:",error);
				}
			});
		};

		//获取openapi的token
		queryToken=function(){
			var APPKEY="36925ca9-6768-47f7-8124-fa2a9a8a2c7d";
			var APPSECRET="d392dff7-14f5-4437-a0b2-5386fa72162f";
			var BASIC="Basic ";
			var auth=Base64.encode(APPKEY+":"+APPSECRET);
			var openId="bigbird-kline:"+Math.random();

			Util.ajax({
				type:"post",
				url:"https://open.hscloud.cn"+"/oauth2/oauth2/token",
				contentType:"application/x-www-form-urlencoded",
				data:{
					grant_type:"client_credentials",
					open_id:openId
				},
				beforeSend:function(request) {
					request.setRequestHeader("Authorization", BASIC+auth);
				},
				success:function(result){
					if(result){
						handleToken(result);
					}
				},
				error:function(error){
					console.error("queryToken:",error);
				}
			});
		};

		/*
		 * 暴露给外部使用的查询方法。传入K线类别和股票代码为参数
		 * 1：1分钟 2：5分钟 3：15分钟 4：30分钟 5：60分钟 6：日K 7：周K 8：月K 9：年K
		 * 10:分时 11：五日
		 */
		getKLine=function(period,code){
			if(code!=undefined){
				//切换股票时刷新storage，避免分时图残留数据影响
				storage={};
				storage.code=code;
			}
			storage.period=supportType[period];
			if(authorization==undefined){
				queryToken();
			}else{
				handleToken();
			}
		};

		return {
			getKLine:getKLine
		};
	})();

	/*
	 * 页面控制器，管理页面启动，页面重置等页面级逻辑
	 */
	pageControl=(function(){
		var beginPage;

		//页面启动逻辑
		beginPage=function(){
			KPainter.init();
		};

		return {
			beginPage:beginPage
		};
	})();

	StockGraph=(function(){
		var draw;

		draw=function(p,c){
			KPainter.showLoading();
			requestDispatcher.getKLine(p,c);
		};

		return {
			draw:draw
		};
	})();

	Util.ready(pageControl.beginPage);
	window.StockGraph=StockGraph;
})();