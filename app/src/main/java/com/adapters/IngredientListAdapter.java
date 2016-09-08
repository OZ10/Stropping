package com.adapters;

import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.support.design.widget.Snackbar;
import android.support.v7.app.AlertDialog;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.NumberPicker;
import android.widget.TextView;

import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;
import com.classes.QuantityItem;
import com.classes.ShoppingListItem;
import com.oz10.stropping.IngredientEditActivity;
import com.oz10.stropping.R;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by Austen on 27/08/2016.
 */
public class IngredientListAdapter extends BaseAdapter {

    public ArrayList<QuantityItem> _ingredientsList = new ArrayList<>();
    public ArrayList<Ingredient> _selectedIngredientsList = new ArrayList<>();
    private int _layoutResource;
    private LayoutInflater _layoutInflater;
    private Context _parentContent;

    public IngredientListAdapter(Context context, List objects, int layoutResource) {

        _ingredientsList = (ArrayList<QuantityItem>) objects;
        _layoutResource = layoutResource;
        _layoutInflater = LayoutInflater.from(context);
        _parentContent = context;
    }

    @Override
    public int getCount() {
        return _ingredientsList.size();
    }

    @Override
    public long getItemId(int i) {
        return i;
    }

    @Override
    public QuantityItem getItem(int i) {
        return _ingredientsList.get(i);
    }

    public void add(Ingredient ingredient)
    {
        _ingredientsList.add(ingredient);
    }

    @Override
    public View getView(int position, View convertView, final ViewGroup parent) {

        View view = convertView;

        // inflate
        if (view == null){
            view = _layoutInflater.inflate(_layoutResource, null);
        }

        // get ingredient
        final QuantityItem ingredient = _ingredientsList.get(position);

        // set default views (common across all layouts)
        if (ingredient != null) {
            SetIngredientName(view, ingredient.getName(), ingredient.getId(), parent);
            SetIngredientQuantity(view, ingredient, parent);

            switch (_layoutResource){
                case R.layout.item_shoppinglist:
                    break;
                case R.layout.item_ingredient:
                    SetIngredientIsSelected(view, (Ingredient)ingredient);
                    break;

                case R.layout.item_recipe_ingredient:
                    SetIngredientDeleteButton(view, (Ingredient)ingredient);
                    break;
            }
        }

        return view;
    }

    private void SetIngredientName(View view, final String ingredientName, final Long ingredientId, final ViewGroup parent)
    {
        TextView textView = (TextView) view.findViewById(R.id.ingredient_name);
        textView.setOnClickListener(new View.OnClickListener(){
                                        @Override
                                        public void onClick(View view) {
                                            Intent intent = new Intent(_parentContent, IngredientEditActivity.class);
                                            intent.putExtra("IngredientId", ingredientId);
                                            _parentContent.startActivity(intent);
                                        }
                                    }
        );
        textView.setText(ingredientName);
    }

    private void SetIngredientQuantity(View view, final QuantityItem ingredient, final ViewGroup parent)
    {
        final TextView textView = (TextView) view.findViewById(R.id.ingredient_quantity);
        textView.setOnClickListener(new View.OnClickListener(){
                                        @Override
                                        public void onClick(View view) {
                                            //TODO Open Edit ingredient activity
//                                            Snackbar snackbar = Snackbar.make(parent, ingredientQuantity + " required!", Snackbar.LENGTH_SHORT);
//                                            snackbar.show();

                                            int currentValue = ingredient.getQuantity();
                                            int minValue = currentValue < 21 ? 1 : currentValue - 20;
                                            int maxValue = currentValue + 20;

                                            final NumberPicker picker = new NumberPicker(_parentContent);
                                            picker.setMinValue(minValue);
                                            picker.setMaxValue(maxValue);
                                            picker.setValue(currentValue);

                                            final FrameLayout parent = new FrameLayout(_parentContent);
                                            parent.addView(picker, new FrameLayout.LayoutParams(
                                                    FrameLayout.LayoutParams.WRAP_CONTENT,
                                                    FrameLayout.LayoutParams.WRAP_CONTENT,
                                                    Gravity.CENTER));

                                            AlertDialog.Builder builder = new AlertDialog.Builder(_parentContent);
                                            builder.setTitle(R.string.dialog_set_quantity);
                                            builder.setView(parent);

                                            builder.setPositiveButton("ok", new DialogInterface.OnClickListener(){

                                                @Override
                                                public void onClick(DialogInterface dialogInterface, int i) {
                                                    int quantity = picker.getValue();
                                                    ingredient.setQuantity(quantity);
                                                    textView.setText(ingredient.getQuantityText());

                                                    StroppingDatabase db = StroppingDatabase.getInstance(_parentContent);

                                                    switch (_layoutResource){
                                                        case R.layout.item_shoppinglist:
                                                            db.updateShoppingListItem((ShoppingListItem) ingredient);
                                                            break;
                                                        case R.layout.item_ingredient:
                                                            db.updateIngredient((Ingredient)ingredient);
                                                            break;
                                                        case R.layout.item_recipe_ingredient:
                                                            break;
                                                    }
                                                }
                                            });

                                            Dialog dialog = builder.create();
                                            dialog.show();
                                        }
                                    }
        );
        textView.setText(ingredient.getQuantityText());
    }

    private void SetIngredientIsSelected(View view, final Ingredient ingredient)
    {
        CheckBox checkBox = (CheckBox) view.findViewById(R.id.ingredient_isselected);
        checkBox.setOnClickListener(new View.OnClickListener(){
                                        @Override
                                        public void onClick(View view) {
                                            CheckBox checkBox = (CheckBox) view; // view.findViewById(R.id.ingredient_isselected);
                                            ingredient.setIsSelected(checkBox.isChecked());

                                            if (ingredient.getIsSelected()){
                                                _selectedIngredientsList.add(ingredient);
                                            }else{
                                                _selectedIngredientsList.remove(ingredient);
                                            }
                                        }
                                    }
        );
        checkBox.setChecked(ingredient.getIsSelected());
    }

    private void SetIngredientDeleteButton(View view, final Ingredient ingredient)
    {
        Button button = (Button) view.findViewById(R.id.ingredient_delete);
        button.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                _ingredientsList.remove(ingredient);

                notifyDataSetChanged();
            }
        });
    }

    public void updateAdapterFromDatabase(Context context)
    {
        StroppingDatabase db = StroppingDatabase.getInstance(_parentContent);

        this._ingredientsList.clear();

        switch (_layoutResource){
            case R.layout.item_shoppinglist:
                ArrayList<ShoppingListItem> shoppingListItems = db.getAllShoppingListItems();
                for (ShoppingListItem shoppingListItem:shoppingListItems
                        ) {
                    _ingredientsList.add(shoppingListItem);
                }
                break;
            case R.layout.item_ingredient:
                ArrayList<Ingredient> ingredientListItems = db.getAllIngredients();
                for (Ingredient ingredientListItem:ingredientListItems
                        ) {
                    _ingredientsList.add(ingredientListItem);
                }
                break;
            case R.layout.item_recipe_ingredient:
                //ArrayList<ShoppingListItem> shoppingListItems1 = db.get
                break;
        }

        notifyDataSetChanged();

        //db.close();

    }

}
